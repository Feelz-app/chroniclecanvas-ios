import Capacitor
import Foundation
import StoreKit
import UIKit

@objc(AppleMembershipBridge)
public class AppleMembershipBridge: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleMembershipBridge"
    public let jsName = "AppleMembershipBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getEnvironment", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setFirebaseSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncCurrentEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentManageSubscriptions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCustomerState", returnType: CAPPluginReturnPromise)
    ]

    private var updatesTask: Task<Void, Never>?

    public override func load() {
        updatesTask = Task {
            for await update in Transaction.updates {
                await self.handle(transactionUpdate: update)
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    @objc func getEnvironment(_ call: CAPPluginCall) {
        call.resolve([
            "platform": "ios",
            "bundleId": SubscriptionCatalog.bundleId,
            "supportsAppleIap": true,
            "usesWebStripeOnIos": false,
            "manageSubscriptionsUrl": SubscriptionCatalog.manageSubscriptionsUrl.absoluteString,
            "products": SubscriptionCatalog.products.map { definition in
                [
                    "planKey": definition.planKey.rawValue,
                    "productId": definition.productId,
                    "displayName": definition.displayName,
                    "marketingName": definition.marketingName
                ]
            }
        ])
    }

    @objc func setFirebaseSession(_ call: CAPPluginCall) {
        let uid = call.getString("uid") ?? ""
        let email = call.getString("email") ?? ""
        let idToken = call.getString("idToken") ?? ""

        guard !uid.isEmpty, !email.isEmpty, !idToken.isEmpty else {
            call.reject("A Chronicle Canvas sign-in session is required before Apple purchases can sync.")
            return
        }

        Task {
            await MembershipSessionStore.shared.update(uid: uid, email: email, idToken: idToken)
            call.resolve([
                "stored": true,
                "uid": uid,
                "email": email
            ])
        }
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await Product.products(for: SubscriptionCatalog.productIds)
                call.resolve([
                    "products": products.map { product in
                        let definition = SubscriptionCatalog.definition(forProductId: product.id)
                        return [
                            "productId": product.id,
                            "planKey": definition?.planKey.rawValue ?? "",
                            "displayName": definition?.displayName ?? product.displayName,
                            "marketingName": definition?.marketingName ?? "",
                            "title": product.displayName,
                            "description": product.description,
                            "price": product.displayPrice
                        ]
                    }
                ])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        let planKey = call.getString("planKey") ?? ""

        guard let definition = SubscriptionCatalog.definition(for: planKey) else {
            call.reject("This Chronicle Canvas membership is not mapped to an Apple subscription yet.")
            return
        }

        Task {
            do {
                let products = try await Product.products(for: [definition.productId])
                guard let product = products.first else {
                    call.reject("Apple has not made this membership product available yet.")
                    return
                }

                let result = try await product.purchase()

                switch result {
                case .success(let verification):
                    let transaction = try self.checkVerified(verification)
                    let sync = try await AppleSubscriptionSyncService.shared.syncSignedTransaction(
                        transactionJws: verification.jwsRepresentation,
                        planKey: definition.planKey.rawValue,
                        productId: definition.productId,
                        reason: "purchase"
                    )
                    await transaction.finish()

                    let response: [String: Any] = [
                        "purchased": true,
                        "productId": definition.productId,
                        "planKey": definition.planKey.rawValue,
                        "refreshRecommended": sync.refreshRecommended
                    ].merging(sync.payload) { current, _ in current }

                    self.notifyListeners("entitlementsChanged", data: response, retainUntilConsumed: true)
                    call.resolve(response)

                case .pending:
                    call.resolve([
                        "pending": true,
                        "productId": definition.productId,
                        "planKey": definition.planKey.rawValue
                    ])

                case .userCancelled:
                    call.resolve([
                        "cancelled": true,
                        "productId": definition.productId,
                        "planKey": definition.planKey.rawValue
                    ])

                @unknown default:
                    call.reject("Apple returned an unknown membership purchase status.")
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                let responses = try await AppleSubscriptionSyncService.shared.syncCurrentEntitlements(reason: "restore")
                let payload: [String: Any] = [
                    "restored": true,
                    "count": responses.count,
                    "refreshRecommended": true
                ]
                self.notifyListeners("entitlementsChanged", data: payload, retainUntilConsumed: true)
                call.resolve(payload)
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func syncCurrentEntitlements(_ call: CAPPluginCall) {
        Task {
            do {
                let responses = try await AppleSubscriptionSyncService.shared.syncCurrentEntitlements()
                call.resolve([
                    "synced": true,
                    "count": responses.count,
                    "refreshRecommended": !responses.isEmpty
                ])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func presentManageSubscriptions(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UIApplication.shared.open(SubscriptionCatalog.manageSubscriptionsUrl, options: [:]) { opened in
                if opened {
                    call.resolve(["opened": true])
                } else {
                    call.reject("iPhone could not open the App Store subscriptions page.")
                }
            }
        }
    }

    @objc func getCustomerState(_ call: CAPPluginCall) {
        Task {
            let session = await MembershipSessionStore.shared.snapshot()
            let entitlements = await AppleSubscriptionSyncService.shared.currentEntitlementsSummary()
            call.resolve([
                "signedInEmail": session?.email ?? "",
                "hasSession": session != nil,
                "entitlements": entitlements
            ])
        }
    }

    private func handle(transactionUpdate result: VerificationResult<Transaction>) async {
        guard case .verified(let transaction) = result else {
            return
        }

        guard let definition = SubscriptionCatalog.definition(forProductId: transaction.productID) else {
            return
        }

        do {
            let sync = try await AppleSubscriptionSyncService.shared.syncSignedTransaction(
                transactionJws: result.jwsRepresentation,
                planKey: definition.planKey.rawValue,
                productId: definition.productId,
                reason: "transaction_update"
            )
            await transaction.finish()
            notifyListeners("entitlementsChanged", data: [
                "productId": definition.productId,
                "planKey": definition.planKey.rawValue,
                "refreshRecommended": sync.refreshRecommended
            ], retainUntilConsumed: true)
        } catch {
            notifyListeners("entitlementsSyncFailed", data: [
                "message": error.localizedDescription,
                "productId": definition.productId,
                "planKey": definition.planKey.rawValue
            ], retainUntilConsumed: true)
        }
    }

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .verified(let safe):
            return safe
        case .unverified(_, let error):
            throw error
        }
    }
}
