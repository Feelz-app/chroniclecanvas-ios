import Foundation
import StoreKit

enum AppleMembershipError: LocalizedError {
    case missingSession
    case invalidResponse
    case noMatchingSubscription

    var errorDescription: String? {
        switch self {
        case .missingSession:
            return "Sign in to Chronicle Canvas before using Apple memberships on iPhone."
        case .invalidResponse:
            return "Chronicle Canvas could not understand the membership sync response."
        case .noMatchingSubscription:
            return "This Apple purchase does not match a Chronicle Canvas membership."
        }
    }
}

struct SubscriptionSyncResponse {
    let payload: [String: Any]

    var refreshRecommended: Bool {
        (payload["refreshRecommended"] as? Bool) ?? true
    }
}

actor AppleSubscriptionSyncService {
    static let shared = AppleSubscriptionSyncService()

    private let sessionStore = MembershipSessionStore.shared

    func syncSignedTransaction(
        transactionJws: String,
        planKey: String,
        productId: String,
        reason: String
    ) async throws -> SubscriptionSyncResponse {
        guard let session = await sessionStore.snapshot() else {
            throw AppleMembershipError.missingSession
        }

        var request = URLRequest(url: SubscriptionCatalog.syncEndpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "idToken": session.idToken,
            "email": session.email,
            "uid": session.uid,
            "planKey": planKey,
            "productId": productId,
            "transactionJws": transactionJws,
            "reason": reason,
            "source": "ios",
            "bundleId": SubscriptionCatalog.bundleId
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw AppleMembershipError.invalidResponse
        }

        guard (200..<300).contains(http.statusCode) else {
            let serverMessage = String(data: data, encoding: .utf8) ?? "Membership sync failed."
            throw NSError(domain: "ChronicleCanvasAppleSync", code: http.statusCode, userInfo: [
                NSLocalizedDescriptionKey: serverMessage
            ])
        }

        let json = try JSONSerialization.jsonObject(with: data, options: [])
        guard let payload = json as? [String: Any] else {
            throw AppleMembershipError.invalidResponse
        }

        return SubscriptionSyncResponse(payload: payload)
    }

    func syncCurrentEntitlements(reason: String = "manual_refresh") async throws -> [SubscriptionSyncResponse] {
        var responses: [SubscriptionSyncResponse] = []

        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else {
                continue
            }

            guard
                transaction.productType == .autoRenewable,
                let definition = SubscriptionCatalog.definition(forProductId: transaction.productID)
            else {
                continue
            }

            let response = try await syncSignedTransaction(
                transactionJws: result.jwsRepresentation,
                planKey: definition.planKey.rawValue,
                productId: transaction.productID,
                reason: reason
            )
            responses.append(response)
        }

        return responses
    }

    func currentEntitlementsSummary() async -> [[String: Any]] {
        var entitlements: [[String: Any]] = []

        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else {
                continue
            }

            let definition = SubscriptionCatalog.definition(forProductId: transaction.productID)

            entitlements.append([
                "productId": transaction.productID,
                "planKey": definition?.planKey.rawValue ?? "",
                "displayName": definition?.displayName ?? transaction.productID,
                "marketingName": definition?.marketingName ?? "",
                "originalTransactionId": String(transaction.originalID),
                "transactionId": String(transaction.id),
                "expirationDate": transaction.expirationDate?.timeIntervalSince1970 ?? 0,
                "isUpgraded": transaction.isUpgraded,
                "ownershipType": transaction.ownershipType.rawValue
            ])
        }

        return entitlements
    }
}
