import Foundation

enum ChroniclePlanKey: String, CaseIterable {
    case family
    case advanced
}

struct SubscriptionProductDefinition {
    let planKey: ChroniclePlanKey
    let productId: String
    let displayName: String
    let marketingName: String
}

enum SubscriptionCatalog {
    static let bundleId = "com.chroniclecanvas.app"
    static let syncEndpoint = URL(string: "https://us-central1-timeline-builder-a5292.cloudfunctions.net/syncAppleSubscription")!
    static let notificationEndpoint = URL(string: "https://us-central1-timeline-builder-a5292.cloudfunctions.net/appleServerNotifications")!
    static let manageSubscriptionsUrl = URL(string: "https://apps.apple.com/account/subscriptions")!

    static let products: [SubscriptionProductDefinition] = [
        SubscriptionProductDefinition(
            planKey: .family,
            productId: "com.chroniclecanvas.app.home.monthly",
            displayName: "Home",
            marketingName: "Home"
        ),
        SubscriptionProductDefinition(
            planKey: .advanced,
            productId: "com.chroniclecanvas.app.advanced.monthly",
            displayName: "Advanced",
            marketingName: "Business Lite"
        )
    ]

    static func definition(for planKey: String) -> SubscriptionProductDefinition? {
        products.first { $0.planKey.rawValue == planKey }
    }

    static func definition(forProductId productId: String) -> SubscriptionProductDefinition? {
        products.first { $0.productId == productId }
    }

    static var productIds: [String] {
        products.map(\.productId)
    }
}
