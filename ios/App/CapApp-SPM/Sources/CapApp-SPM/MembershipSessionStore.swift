import Foundation

struct MembershipSessionSnapshot {
    let uid: String
    let email: String
    let idToken: String
}

actor MembershipSessionStore {
    static let shared = MembershipSessionStore()

    private let defaults = UserDefaults.standard
    private let uidKey = "chroniclecanvas.membership.uid"
    private let emailKey = "chroniclecanvas.membership.email"
    private let tokenKey = "chroniclecanvas.membership.idToken"

    func update(uid: String, email: String, idToken: String) {
        defaults.set(uid, forKey: uidKey)
        defaults.set(email, forKey: emailKey)
        defaults.set(idToken, forKey: tokenKey)
    }

    func snapshot() -> MembershipSessionSnapshot? {
        guard
            let uid = defaults.string(forKey: uidKey),
            let email = defaults.string(forKey: emailKey),
            let idToken = defaults.string(forKey: tokenKey),
            !uid.isEmpty,
            !email.isEmpty,
            !idToken.isEmpty
        else {
            return nil
        }

        return MembershipSessionSnapshot(uid: uid, email: email, idToken: idToken)
    }

    func clear() {
        defaults.removeObject(forKey: uidKey)
        defaults.removeObject(forKey: emailKey)
        defaults.removeObject(forKey: tokenKey)
    }
}
