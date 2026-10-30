import Foundation
import WatchConnectivity

/// Fallback channel: the iPhone app pushes the same public snapshot it already has.
///
/// Accepted payloads (all carry a `ContentEnvelope` JSON, full or trimmed to
/// `content.codes/drugs/commercialNames/status4`):
/// - `transferFile` with metadata `["kind": "samur-content-v3"]` (preferred: large),
/// - `transferUserInfo` with `["kind": "samur-content-v3", "content": Data]` (small payloads).
///
/// The Watch can ask for a copy with `sendMessage(["kind": "samur-content-request"])`
/// when the phone app is reachable; the iPhone module surfaces that as an event.
final class PhoneContentReceiver: NSObject, WCSessionDelegate {
    static let payloadKind = "samur-content-v3"
    static let requestKind = "samur-content-request"

    private let store: ContentStore

    init(store: ContentStore) {
        self.store = store
        super.init()
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// Asks the iPhone for its copy. Best effort: silently does nothing when unreachable.
    func requestContentFromPhone() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated, session.isReachable else { return }
        let hash = MainActor.assumeIsolated { store.content?.hash } ?? ""
        session.sendMessage(["kind": Self.requestKind, "hash": hash], replyHandler: nil, errorHandler: nil)
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

    func session(_ session: WCSession, didReceive file: WCSessionFile) {
        guard file.metadata?["kind"] as? String == Self.payloadKind else { return }
        // The system deletes the file when this method returns: read it synchronously.
        guard let data = try? Data(contentsOf: file.fileURL) else { return }
        ingest(data)
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        guard userInfo["kind"] as? String == Self.payloadKind else { return }
        if let data = userInfo["content"] as? Data {
            ingest(data)
        } else if let json = userInfo["content"] as? String, let data = json.data(using: .utf8) {
            ingest(data)
        }
    }

    private func ingest(_ data: Data) {
        guard let envelope = try? JSONDecoder().decode(ContentEnvelope.self, from: data),
              let content = try? WatchContent(envelope: envelope, origin: .phone)
        else { return }
        let store = store
        Task { @MainActor in
            await store.acceptFromPhone(content)
        }
    }
}
