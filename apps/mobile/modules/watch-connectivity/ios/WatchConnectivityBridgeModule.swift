import ExpoModulesCore
import WatchConnectivity

/// iPhone side of the Watch fallback channel. JS hands over the public snapshot (as JSON
/// text) once the iPhone has a verified copy; this writes it to a file and queues a
/// `transferFile`, which the system delivers in the background whenever the Watch is
/// reachable, even if the iPhone app is closed by then.
public class WatchConnectivityBridgeModule: Module {
    public func definition() -> ModuleDefinition {
        Name("WatchConnectivityBridge")

        Events("onContentRequested")

        OnCreate {
            WatchSessionCoordinator.shared.onContentRequested = { [weak self] hash in
                self?.sendEvent("onContentRequested", ["hash": hash])
            }
            WatchSessionCoordinator.shared.activate()
        }

        OnDestroy {
            WatchSessionCoordinator.shared.onContentRequested = nil
        }

        Function("getState") { () -> [String: Any] in
            WatchSessionCoordinator.shared.state()
        }

        AsyncFunction("sendContent") { (json: String, hash: String, generatedAt: String, promise: Promise) in
            WatchSessionCoordinator.shared.sendContent(json: json, hash: hash, generatedAt: generatedAt) { result in
                promise.resolve(result)
            }
        }
    }
}

final class WatchSessionCoordinator: NSObject, WCSessionDelegate {
    static let shared = WatchSessionCoordinator()

    /// Must match `PhoneContentReceiver.payloadKind` / `.requestKind` in targets/watch.
    static let payloadKind = "samur-content-v3"
    static let requestKind = "samur-content-request"

    var onContentRequested: ((String) -> Void)?

    private let queue = DispatchQueue(label: "es.madrid.samur.manual.watch-connectivity")
    private var pendingUntilActivated: [() -> Void] = []

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        if session.delegate == nil { session.delegate = self }
        if session.activationState != .activated { session.activate() }
    }

    func state() -> [String: Any] {
        guard WCSession.isSupported() else { return ["supported": false] }
        let session = WCSession.default
        return [
            "supported": true,
            "activated": session.activationState == .activated,
            "paired": session.isPaired,
            "watchAppInstalled": session.isWatchAppInstalled,
            "reachable": session.isReachable,
            "outstandingTransfers": session.outstandingFileTransfers.count,
        ]
    }

    func sendContent(json: String, hash: String, generatedAt: String, completion: @escaping ([String: Any]) -> Void) {
        guard WCSession.isSupported() else {
            completion(["queued": false, "reason": "unsupported"])
            return
        }
        activate()
        whenActivated { [weak self] in
            guard let self else { return }
            let session = WCSession.default
            guard session.activationState == .activated else {
                completion(["queued": false, "reason": "inactive"])
                return
            }
            guard session.isPaired else {
                completion(["queued": false, "reason": "not-paired"])
                return
            }
            guard session.isWatchAppInstalled else {
                completion(["queued": false, "reason": "watch-app-not-installed"])
                return
            }
            do {
                let file = try self.writeOutboxFile(json: json, hash: hash)
                // Only the newest snapshot matters: drop queued transfers of older ones.
                for transfer in session.outstandingFileTransfers
                where transfer.file.metadata?["kind"] as? String == Self.payloadKind
                    && transfer.file.metadata?["hash"] as? String != hash {
                    transfer.cancel()
                }
                let alreadyQueued = session.outstandingFileTransfers.contains {
                    $0.file.metadata?["hash"] as? String == hash
                }
                if !alreadyQueued {
                    session.transferFile(file, metadata: [
                        "kind": Self.payloadKind,
                        "hash": hash,
                        "generatedAt": generatedAt,
                    ])
                }
                completion(["queued": true])
            } catch {
                completion(["queued": false, "reason": "write-failed"])
            }
        }
    }

    private func writeOutboxFile(json: String, hash: String) throws -> URL {
        let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("watch-outbox", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let safeHash = hash.filter { $0.isLetter || $0.isNumber }.prefix(64)
        let file = directory.appendingPathComponent("content-\(safeHash).json")
        try Data(json.utf8).write(to: file, options: .atomic)
        return file
    }

    private func whenActivated(_ work: @escaping () -> Void) {
        queue.async {
            if WCSession.default.activationState == .activated {
                DispatchQueue.main.async(execute: work)
            } else {
                self.pendingUntilActivated.append(work)
                // Do not wait forever if activation never completes.
                self.queue.asyncAfter(deadline: .now() + 5) { self.flushPending() }
            }
        }
    }

    private func flushPending() {
        let pending = pendingUntilActivated
        pendingUntilActivated = []
        pending.forEach { work in DispatchQueue.main.async(execute: work) }
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        queue.async { self.flushPending() }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        // Switching paired watches: reactivate for the new one.
        session.activate()
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        guard message["kind"] as? String == Self.requestKind else { return }
        let hash = message["hash"] as? String ?? ""
        DispatchQueue.main.async { self.onContentRequested?(hash) }
    }

    func session(_ session: WCSession, didFinish fileTransfer: WCSessionFileTransfer, error: Error?) {
        guard error == nil else { return }
        try? FileManager.default.removeItem(at: fileTransfer.file.fileURL)
    }
}
