import Foundation
import AppKit

let quiet = CommandLine.arguments.contains("--no-browser")
func abortLaunch(_ message: String) -> Never {
    if quiet {
        FileHandle.standardError.write(Data((message + "\n").utf8))
    } else {
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        app.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "懷特先生無法啟動"
        alert.informativeText = message
        alert.alertStyle = .critical
        alert.addButton(withTitle: "好")
        alert.runModal()
    }
    exit(1)
}
let bundle = Bundle.main.bundleURL
let resources = bundle.appendingPathComponent("Contents/Resources")
let fm = FileManager.default
var project = bundle.deletingLastPathComponent().appendingPathComponent("mr-white").path
if !fm.fileExists(atPath: project + "/scripts/launch-local.mjs") {
    project = (try? String(contentsOf: resources.appendingPathComponent("ProjectPath"), encoding: .utf8))?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
}
let node = (try? String(contentsOf: resources.appendingPathComponent("NodePath"), encoding: .utf8))?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
guard fm.isExecutableFile(atPath: node), fm.fileExists(atPath: project + "/scripts/launch-local.mjs") else {
    abortLaunch("找不到 Node.js 或專案資料夾。請保留 mr-white 資料夾並重新建立啟動器。")
}
let child = Process()
child.executableURL = URL(fileURLWithPath: node)
child.currentDirectoryURL = URL(fileURLWithPath: project)
child.arguments = [project + "/scripts/launch-local.mjs"] + (quiet ? ["--no-browser"] : [])
var environment = ProcessInfo.processInfo.environment
environment["PATH"] = URL(fileURLWithPath: node).deletingLastPathComponent().path + ":/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
child.environment = environment
do { try child.run() }
catch { abortLaunch("無法啟動本機服務，請確認 Node.js 仍可執行。") }
child.waitUntilExit()
exit(child.terminationStatus)
