const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fs = require("fs");
const {X509Certificate} = require("crypto");
const {
  Environment,
  SignedDataVerifier,
} = require("@apple/app-store-server-library");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const planRanks = {
  free: 0,
  family: 1,
  advanced: 2,
};

const appleProducts = {
  "com.chroniclecanvas.app.home.monthly": "family",
  "com.chroniclecanvas.app.advanced.monthly": "advanced",
};

let verifier = null;

function normalizePlanKey(planKey) {
  if (planKey === "business") return "advanced";
  return String(planKey || "free");
}

function getVerifier() {
  if (verifier) return verifier;

  const bundleId = process.env.APPLE_BUNDLE_ID;
  const rootPaths = String(process.env.APPLE_ROOT_CA_PATHS || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  if (!bundleId || !rootPaths.length) {
    throw new Error("Apple verifier env is incomplete.");
  }

  const certs = rootPaths.map((certPath) =>
    new X509Certificate(fs.readFileSync(certPath)),
  );

  const environment = String(process.env.APPLE_IAP_ENVIRONMENT || "Sandbox")
      .toLowerCase() === "production" ?
    Environment.PRODUCTION :
    Environment.SANDBOX;

  const appAppleId = process.env.APPLE_APP_STORE_APP_ID ?
    Number(process.env.APPLE_APP_STORE_APP_ID) :
    undefined;

  verifier = new SignedDataVerifier(
      certs,
      true,
      environment,
      bundleId,
      appAppleId,
  );

  return verifier;
}

function resolveEffectivePlan(userData = {}, incomingApplePlan = "free") {
  const applePlan = normalizePlanKey(incomingApplePlan);
  const stripePlan = isStripeActive(userData) ?
    normalizePlanKey(userData.stripePlan || userData.plan) :
    "free";

  return planRanks[applePlan] >= planRanks[stripePlan] ? applePlan : stripePlan;
}

function isStripeActive(userData = {}) {
  return ["active", "trialing", "past_due"].includes(
      String(userData.stripeSubscriptionStatus || ""),
  );
}

async function lookupUidFromNotificationPayload(payload = {}) {
  const appAccountToken = payload.appAccountToken;
  if (appAccountToken) {
    const snapshot = await db.collection("users")
        .where("appleAppAccountToken", "==", String(appAccountToken))
        .limit(1)
        .get();
    if (!snapshot.empty) return snapshot.docs[0].id;
  }

  const originalTransactionId = payload.originalTransactionId || payload.originalTransactionId?.toString();
  if (originalTransactionId) {
    const snapshot = await db.collection("users")
        .where("appleOriginalTransactionId", "==", String(originalTransactionId))
        .limit(1)
        .get();
    if (!snapshot.empty) return snapshot.docs[0].id;
  }

  return "";
}

async function persistAppleEntitlement({uid, email, decodedTransaction, source}) {
  const productId = String(decodedTransaction.productId || "");
  const applePlan = normalizePlanKey(appleProducts[productId]);
  if (applePlan === "free") {
    throw new Error(`Unknown Apple product id: ${productId}`);
  }

  const userRef = db.collection("users").doc(uid);
  const snapshot = await userRef.get();
  const userData = snapshot.data() || {};
  const expiresDate = decodedTransaction.expiresDate ?
    Number(decodedTransaction.expiresDate) :
    0;
  const nowMs = Date.now();
  const appleStatus = expiresDate && expiresDate < nowMs ? "expired" : "active";
  const nextPlan = appleStatus === "active" ?
    resolveEffectivePlan(userData, applePlan) :
    resolveEffectivePlan(userData, "free");

  const update = {
    uid,
    email: email || userData.email || "",
    applePlan,
    appleProductId: productId,
    appleOriginalTransactionId: String(decodedTransaction.originalTransactionId || ""),
    appleTransactionId: String(decodedTransaction.transactionId || ""),
    appleSubscriptionStatus: appleStatus,
    appleExpiresAt: expiresDate,
    appleEnvironment: decodedTransaction.environment || "",
    appleLastSource: source,
    appleLastSyncedAt: nowMs,
    plan: nextPlan,
    effectivePlan: nextPlan,
    updatedAt: nowMs,
  };

  if (decodedTransaction.appAccountToken) {
    update.appleAppAccountToken = String(decodedTransaction.appAccountToken);
  }

  if (isStripeActive(userData)) {
    update.stripePlan = normalizePlanKey(userData.stripePlan || userData.plan);
  }

  await userRef.set(update, {merge: true});

  return {
    synced: true,
    uid,
    plan: nextPlan,
    applePlan,
    refreshRecommended: true,
  };
}

exports.syncAppleSubscription = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({error: "Method not allowed"});
  }

  try {
    const {
      idToken,
      email,
      uid,
      transactionJws,
      source = "ios",
    } = req.body || {};

    if (!idToken || !transactionJws) {
      return res.status(400).json({error: "Missing idToken or transactionJws"});
    }

    const decodedAuth = await admin.auth().verifyIdToken(String(idToken));
    if (uid && String(uid) !== decodedAuth.uid) {
      return res.status(403).json({error: "User mismatch"});
    }

    const decodedTransaction = await getVerifier()
        .verifyAndDecodeTransaction(String(transactionJws));

    const payload = await persistAppleEntitlement({
      uid: decodedAuth.uid,
      email: email || decodedAuth.email || "",
      decodedTransaction,
      source,
    });

    return res.status(200).json(payload);
  } catch (error) {
    console.error("syncAppleSubscription failed", error);
    return res.status(500).json({
      error: error.message || "Apple subscription sync failed.",
    });
  }
});

exports.appleServerNotifications = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const signedPayload = req.body?.signedPayload;
    if (!signedPayload) {
      return res.status(400).send("Missing signedPayload");
    }

    const decodedNotification = await getVerifier()
        .verifyAndDecodeNotification(String(signedPayload));
    const signedTransactionInfo =
      decodedNotification?.data?.signedTransactionInfo;

    if (!signedTransactionInfo) {
      return res.status(200).send("Notification ignored");
    }

    const decodedTransaction = await getVerifier()
        .verifyAndDecodeTransaction(String(signedTransactionInfo));
    const uid = await lookupUidFromNotificationPayload(decodedTransaction);

    if (!uid) {
      return res.status(200).send("No matching Chronicle Canvas user");
    }

    const userSnapshot = await db.collection("users").doc(uid).get();
    const userData = userSnapshot.data() || {};

    await persistAppleEntitlement({
      uid,
      email: userData.email || "",
      decodedTransaction,
      source: "app_store_notification",
    });

    return res.status(200).send("Notification processed");
  } catch (error) {
    console.error("appleServerNotifications failed", error);
    return res.status(500).send(error.message || "Notification failed");
  }
});

