import { auth, db, functions } from "./firebase.js";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";

const deletionBucketLabels = {
  events: "Timeline events",
  trash: "Trash",
  attachments: "Uploaded files",
  dashboard: "Dashboard layout",
  composer: "Composer layout",
  sharing: "Authorized users"
};

const params = new URLSearchParams(window.location.search);
const pageType = document.body.dataset.deletePage || "account";
const prefilledEmail = normalizeEmail(params.get("email") || "");
const deletedNotice = params.get("deleted") === "1";

const deleteStatus = document.getElementById("deletePageStatus");
const signedOutGate = document.getElementById("deleteSignedOut");
const signedInGate = document.getElementById("deleteSignedIn");
const deleteEmailInput = document.getElementById("deleteEmailInput");
const deletePasswordInput = document.getElementById("deletePasswordInput");
const deleteLoginBtn = document.getElementById("deleteLoginBtn");
const deleteResetBtn = document.getElementById("deleteResetBtn");
const deleteLogoutBtn = document.getElementById("deleteLogoutBtn");
const deleteSignedInEmail = document.getElementById("deleteSignedInEmail");
const deleteAccountReasonInput = document.getElementById("deleteAccountReasonInput");
const deleteAccountImprovementInput = document.getElementById("deleteAccountImprovementInput");
const deleteAccountBtn = document.getElementById("deleteAccountBtn");
const deleteDataOptionsGrid = document.getElementById("deleteDataOptionsGrid");
const deleteDataRoleHint = document.getElementById("deleteDataRoleHint");
const deleteSelectedDataBtn = document.getElementById("deleteSelectedDataBtn");

if (deleteEmailInput && prefilledEmail) {
  deleteEmailInput.value = prefilledEmail;
}

if (deletedNotice) {
  setDeletePageStatus("Account deleted. Chronicle Canvas has cleared the sign-in and its matching data.", "success");
}

deleteLoginBtn?.addEventListener("click", async () => {
  const emailValue = normalizeEmail(deleteEmailInput?.value || "");
  const passwordValue = deletePasswordInput?.value || "";

  if (!emailValue || !passwordValue) {
    setDeletePageStatus("Enter the account email and password first.", "error");
    return;
  }

  await withBusy(deleteLoginBtn, "Logging In...", async () => {
    await signInWithEmailAndPassword(auth, emailValue, passwordValue);
    setDeletePageStatus("Signed in.", "success");
  });
});

deleteResetBtn?.addEventListener("click", async () => {
  const emailValue = normalizeEmail(deleteEmailInput?.value || "");

  if (!emailValue) {
    setDeletePageStatus("Enter the account email first so the reset email knows where to go.", "error");
    return;
  }

  await withBusy(deleteResetBtn, "Sending...", async () => {
    await sendPasswordResetEmail(auth, emailValue);
    setDeletePageStatus("Password reset email sent.", "success");
  });
});

deleteLogoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
});

deleteSelectedDataBtn?.addEventListener("click", async () => {
  const selectedBuckets = getSelectedDeletionBuckets();

  if (!selectedBuckets.length) {
    setDeletePageStatus("Choose at least one data group before deleting anything.", "error");
    return;
  }

  const bucketSummary = selectedBuckets.map((bucket) => deletionBucketLabels[bucket] || bucket).join(", ");
  if (!window.confirm(`Delete ${bucketSummary} now? This cannot be undone.`)) {
    return;
  }

  await withBusy(deleteSelectedDataBtn, "Deleting...", async () => {
    const deleteSelectedDataCallable = httpsCallable(functions, "deleteSelectedData");
    await deleteSelectedDataCallable({
      buckets: selectedBuckets
    });
    clearSelectedDeletionBuckets();
    setDeletePageStatus("Selected data deleted.", "success");
  });
});

deleteAccountBtn?.addEventListener("click", async () => {
  const currentUser = auth.currentUser;
  const currentEmail = normalizeEmail(currentUser?.email || prefilledEmail);
  const accountMessage = pageType === "account"
    ? "This permanently deletes the account, the matching Chronicle Canvas data, and the sign-in itself."
    : "This permanently deletes the account.";

  if (!window.confirm(`${accountMessage}\n\nDelete ${currentEmail || "this account"} now?`)) {
    return;
  }

  await withBusy(deleteAccountBtn, "Deleting...", async () => {
    const deleteOwnAccountCallable = httpsCallable(functions, "deleteOwnAccount");
    await deleteOwnAccountCallable({
      feedback: {
        reason: deleteAccountReasonInput?.value.trim() || "",
        improvement: deleteAccountImprovementInput?.value.trim() || ""
      }
    });
    await signOut(auth).catch(() => {});
    window.location.href = "delete-account.html?deleted=1";
  });
});

onAuthStateChanged(auth, async (user) => {
  const signedIn = Boolean(user);
  if (signedOutGate) {
    signedOutGate.hidden = signedIn;
  }
  if (signedInGate) {
    signedInGate.hidden = !signedIn;
  }

  if (!signedIn) {
    if (deleteSignedInEmail) {
      deleteSignedInEmail.textContent = prefilledEmail || "Sign in to continue.";
    }
    syncDeleteDataOptionAvailability({
      isWorkspaceOwner: false
    });
    return;
  }

  const currentEmail = normalizeEmail(user.email || "");
  if (deleteSignedInEmail) {
    deleteSignedInEmail.textContent = currentEmail || "Signed in";
  }

  const userContext = await loadDeletionUserContext(user.uid);
  syncDeleteDataOptionAvailability(userContext);
});

async function loadDeletionUserContext(uid) {
  try {
    const snapshot = await getDoc(doc(db, "users", uid));
    const data = snapshot.data() || {};
    return {
      isWorkspaceOwner: !data.workspaceOwnerUid || data.workspaceOwnerUid === uid
    };
  } catch (error) {
    return {
      isWorkspaceOwner: true
    };
  }
}

function syncDeleteDataOptionAvailability(context = {}) {
  if (!deleteDataOptionsGrid) return;

  const isWorkspaceOwner = Boolean(context.isWorkspaceOwner);
  deleteDataOptionsGrid.querySelectorAll("[data-owner-only-delete-option]").forEach((row) => {
    row.hidden = !isWorkspaceOwner;
    const input = row.querySelector("[data-delete-bucket]");
    if (input && !isWorkspaceOwner) {
      input.checked = false;
    }
  });

  if (deleteDataRoleHint) {
    deleteDataRoleHint.textContent = isWorkspaceOwner
      ? "Delete only what you mean to. Timeline data, files, trash, and sharing changes apply to the whole workspace you purchased."
      : "Shared members can clear their own layout preferences here. Timeline data, files, trash, and sharing settings stay with the purchasing account.";
  }
}

function getSelectedDeletionBuckets() {
  return [...(deleteDataOptionsGrid?.querySelectorAll("[data-delete-bucket]") || [])]
    .filter((input) => {
      const bucket = String(input.dataset.deleteBucket || "").trim();
      const row = inputRowForBucket(bucket);
      return input.checked && (!row || !row.hidden);
    })
    .map((input) => String(input.dataset.deleteBucket || "").trim())
    .filter(Boolean);
}

function inputRowForBucket(bucket) {
  return deleteDataOptionsGrid?.querySelector(`[data-delete-option="${bucket}"]`) || null;
}

function clearSelectedDeletionBuckets() {
  deleteDataOptionsGrid?.querySelectorAll("[data-delete-bucket]").forEach((input) => {
    input.checked = false;
  });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function setDeletePageStatus(message, tone = "info") {
  if (!deleteStatus) return;

  if (!message) {
    deleteStatus.hidden = true;
    deleteStatus.textContent = "";
    deleteStatus.className = "statusBanner deletePageStatus";
    return;
  }

  deleteStatus.hidden = false;
  deleteStatus.textContent = message;
  deleteStatus.className = `statusBanner deletePageStatus ${tone}`;
}

async function withBusy(button, label, task) {
  if (!button) return false;
  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = label;

  try {
    await task();
    return true;
  } catch (error) {
    setDeletePageStatus(getDeleteFlowErrorMessage(error), "error");
    return false;
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

function getDeleteFlowErrorMessage(error) {
  switch (error?.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "That email and password combination does not look right yet.";
    case "auth/user-not-found":
      return "That account does not exist yet.";
    case "functions/failed-precondition":
      return error.message || "That action is not available for this kind of account.";
    default:
      return error?.message || "That action could not be finished yet. Please try again.";
  }
}
