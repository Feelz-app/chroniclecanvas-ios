import Capacitor
import Foundation
import WebKit

public class ChronicleCanvasBridgeViewController: CAPBridgeViewController {
    private let bridgeScript = """
    (() => {
      if (window.__chronicleCanvasIosBridgeLoaded) return;
      window.__chronicleCanvasIosBridgeLoaded = true;

      const plugin = () => window.Capacitor?.Plugins?.AppleMembershipBridge || null;
      const state = { lastToken: "", lastEmail: "" };

      const toPlainError = (error) => {
        if (!error) return "Something went wrong.";
        if (typeof error === "string") return error;
        return error.message || error.localizedDescription || "Something went wrong.";
      };

      const pause = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

      const currentAuthUser = () => {
        try {
          for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = window.localStorage.key(index);
            if (!key || !key.startsWith("firebase:authUser:")) continue;
            const raw = window.localStorage.getItem(key);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            const token = parsed?.stsTokenManager?.accessToken || "";
            const email = parsed?.email || "";
            const uid = parsed?.uid || "";
            if (token && email && uid) {
              return { token, email, uid };
            }
          }
        } catch (error) {
          console.warn("Chronicle Canvas iOS bridge could not read auth state", error);
        }
        return null;
      };

      const syncFirebaseSession = async () => {
        const authUser = currentAuthUser();
        if (!authUser) return false;
        if (authUser.token === state.lastToken && authUser.email === state.lastEmail) return true;

        const native = plugin();
        if (!native?.setFirebaseSession) return false;

        await native.setFirebaseSession({
          uid: authUser.uid,
          email: authUser.email,
          idToken: authUser.token
        });

        state.lastToken = authUser.token;
        state.lastEmail = authUser.email;
        return true;
      };

      const flashMessage = (text, tone = "info") => {
        const existing = document.getElementById("chronicle-ios-membership-toast");
        if (existing) existing.remove();
        const toast = document.createElement("div");
        toast.id = "chronicle-ios-membership-toast";
        toast.textContent = text;
        toast.style.position = "fixed";
        toast.style.left = "50%";
        toast.style.bottom = "24px";
        toast.style.transform = "translateX(-50%)";
        toast.style.zIndex = "99999";
        toast.style.padding = "12px 16px";
        toast.style.borderRadius = "14px";
        toast.style.background = tone === "error" ? "rgba(125, 20, 35, 0.95)" : "rgba(14, 27, 49, 0.96)";
        toast.style.border = "1px solid rgba(118, 163, 255, 0.35)";
        toast.style.boxShadow = "0 18px 48px rgba(0,0,0,0.28)";
        toast.style.color = "#f5f8ff";
        toast.style.font = "600 14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
        toast.style.maxWidth = "min(90vw, 420px)";
        toast.style.textAlign = "center";
        document.body.appendChild(toast);
        window.setTimeout(() => toast.remove(), 3200);
      };

      const relabelButtons = () => {
        document.querySelectorAll("[data-upgrade-plan]").forEach((button) => {
          const planKey = button.dataset.upgradePlan || "";
          if (!["family", "advanced"].includes(planKey)) return;
          button.dataset.iosMembershipBridge = "1";
          if (!button.disabled) {
            button.textContent = "Subscribe with Apple";
          }
        });

        const manageBilling = document.getElementById("manageBillingPlanBtn");
        if (manageBilling) {
          manageBilling.textContent = "Manage Apple Subscription";
          manageBilling.dataset.iosMembershipBridge = "1";
        }

        document.querySelectorAll(".planHint").forEach((hint) => {
          const text = (hint.textContent || "").trim();
          if (/Stripe billing portal/i.test(text)) {
            hint.textContent = "This iPhone app uses Apple subscriptions. Manage renewals in your Apple subscription settings.";
          } else if (/Stripe billing/i.test(text)) {
            hint.textContent = "This iPhone app uses Apple subscriptions for paid plans.";
          }
        });

        if (!document.getElementById("chronicle-ios-membership-note")) {
          const target = document.querySelector("#settingsPlanPanel .panelHeader div, #upgradePanel .panelHeader div");
          if (target) {
            const note = document.createElement("p");
            note.id = "chronicle-ios-membership-note";
            note.className = "planHint";
            note.textContent = "On iPhone, Home and Advanced memberships are billed by Apple. Your web subscription still stays on the Chronicle Canvas site.";
            target.appendChild(note);
          }
        }
      };

      const purchasePlan = async (planKey, button) => {
        const native = plugin();
        if (!native?.purchase) {
          flashMessage("Apple memberships are still loading on this iPhone. Try again in a moment.", "error");
          return;
        }

        const synced = await syncFirebaseSession();
        if (!synced) {
          flashMessage("Sign in to Chronicle Canvas first, then try Apple membership again.", "error");
          return;
        }

        const previousLabel = button?.textContent || "";
        if (button) {
          button.disabled = true;
          button.textContent = "Opening Apple…";
        }

        try {
          const result = await native.purchase({ planKey });
          if (result?.cancelled) {
            flashMessage("Apple membership purchase was cancelled.");
            return;
          }
          if (result?.pending) {
            flashMessage("Apple is still processing that purchase. Chronicle Canvas will refresh when it lands.");
            return;
          }
          flashMessage("Membership updated. Refreshing Chronicle Canvas…");
          await pause(1200);
          window.location.reload();
        } catch (error) {
          flashMessage(toPlainError(error), "error");
        } finally {
          if (button) {
            button.disabled = false;
            button.textContent = previousLabel || "Subscribe with Apple";
          }
        }
      };

      const bindCaptureHandlers = () => {
        document.addEventListener("click", async (event) => {
          const upgradeButton = event.target.closest?.("[data-upgrade-plan]");
          if (upgradeButton) {
            const planKey = upgradeButton.dataset.upgradePlan || "";
            if (["family", "advanced"].includes(planKey) && !upgradeButton.disabled) {
              event.preventDefault();
              event.stopPropagation();
              event.stopImmediatePropagation?.();
              await purchasePlan(planKey, upgradeButton);
              return;
            }
          }

          const manageBilling = event.target.closest?.("#manageBillingPlanBtn");
          if (manageBilling) {
            const native = plugin();
            if (native?.presentManageSubscriptions) {
              event.preventDefault();
              event.stopPropagation();
              event.stopImmediatePropagation?.();
              try {
                await native.presentManageSubscriptions();
              } catch (error) {
                flashMessage(toPlainError(error), "error");
              }
            }
          }
        }, true);
      };

      const installNativeHelpers = () => {
        window.ChronicleCanvasIOS = {
          isNativeApp: true,
          async purchasePlan(planKey) {
            return purchasePlan(planKey);
          },
          async restorePurchases() {
            try {
              const native = plugin();
              if (!native?.restorePurchases) throw new Error("Apple restore is not ready yet.");
              await syncFirebaseSession();
              const result = await native.restorePurchases();
              flashMessage(result?.count ? "Purchases restored. Refreshing Chronicle Canvas…" : "No Apple memberships were restored.");
              if (result?.count) {
                await pause(1200);
                window.location.reload();
              }
              return result;
            } catch (error) {
              flashMessage(toPlainError(error), "error");
              throw error;
            }
          },
          async syncCurrentEntitlements() {
            const native = plugin();
            if (!native?.syncCurrentEntitlements) return;
            const synced = await syncFirebaseSession();
            if (!synced) return;
            const result = await native.syncCurrentEntitlements();
            if (result?.refreshRecommended) {
              window.location.reload();
            }
          },
          async openManageSubscriptions() {
            const native = plugin();
            if (!native?.presentManageSubscriptions) return;
            return native.presentManageSubscriptions();
          }
        };
      };

      const watchForChanges = () => {
        const observer = new MutationObserver(() => relabelButtons());
        observer.observe(document.documentElement, { childList: true, subtree: true });
      };

      const boot = async () => {
        document.documentElement.classList.add("chronicle-ios-app");
        installNativeHelpers();
        bindCaptureHandlers();
        relabelButtons();
        watchForChanges();
        await syncFirebaseSession();
        const native = plugin();
        if (native?.addListener) {
          native.addListener("entitlementsChanged", async () => {
            flashMessage("Chronicle Canvas refreshed your Apple membership.");
            await pause(1000);
            window.location.reload();
          });
          native.addListener("entitlementsSyncFailed", (payload) => {
            flashMessage(payload?.message || "Chronicle Canvas could not sync your Apple membership yet.", "error");
          });
        }
        window.setTimeout(() => {
          window.ChronicleCanvasIOS?.syncCurrentEntitlements?.().catch(() => {});
        }, 2200);
        window.setInterval(() => {
          syncFirebaseSession().catch(() => {});
          relabelButtons();
        }, 5000);
      };

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => boot().catch(console.error), { once: true });
      } else {
        boot().catch(console.error);
      }
    })();
    """

    public override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(AppleMembershipBridge())
        injectMembershipBridge()
    }

    private func injectMembershipBridge() {
        guard let webView = bridge?.webView else {
            return
        }

        let userScript = WKUserScript(
            source: bridgeScript,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: false
        )

        webView.configuration.userContentController.addUserScript(userScript)
        webView.evaluateJavaScript(bridgeScript, completionHandler: nil)
    }
}
