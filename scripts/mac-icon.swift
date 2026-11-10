import AppKit

// Code-native icon, using the existing ink / muted green brand colors.
let output = CommandLine.arguments[1]
let sizes = [(16, "icon_16x16"), (32, "icon_16x16@2x"), (32, "icon_32x32"),
             (64, "icon_32x32@2x"), (128, "icon_128x128"), (256, "icon_128x128@2x"),
             (256, "icon_256x256"), (512, "icon_256x256@2x"), (512, "icon_512x512"),
             (1024, "icon_512x512@2x")]
for (size, name) in sizes {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    let scale = CGFloat(size) / 1024
    let transform = NSAffineTransform()
    transform.scale(by: scale)
    transform.concat()
    NSColor(calibratedRed: 0.067, green: 0.09, blue: 0.118, alpha: 1).setFill()
    let base = NSBezierPath(roundedRect: NSRect(x: 42, y: 42, width: 940, height: 940), xRadius: 210, yRadius: 210)
    base.fill()
    NSColor(calibratedRed: 0.31, green: 0.39, blue: 0.35, alpha: 0.65).setStroke()
    base.lineWidth = 5
    base.stroke()
    let ink = NSColor(calibratedRed: 0.714, green: 0.804, blue: 0.725, alpha: 1)
    ink.setStroke()
    let feather = NSBezierPath()
    feather.move(to: NSPoint(x: 283, y: 320))
    feather.line(to: NSPoint(x: 283, y: 515))
    feather.curve(to: NSPoint(x: 588, y: 786), controlPoint1: NSPoint(x: 420, y: 662), controlPoint2: NSPoint(x: 473, y: 786))
    feather.curve(to: NSPoint(x: 764, y: 610), controlPoint1: NSPoint(x: 695, y: 786), controlPoint2: NSPoint(x: 764, y: 716))
    feather.curve(to: NSPoint(x: 498, y: 330), controlPoint1: NSPoint(x: 764, y: 529), controlPoint2: NSPoint(x: 610, y: 430))
    feather.line(to: NSPoint(x: 283, y: 320))
    feather.move(to: NSPoint(x: 226, y: 260))
    feather.line(to: NSPoint(x: 647, y: 681))
    feather.move(to: NSPoint(x: 431, y: 465))
    feather.line(to: NSPoint(x: 431, y: 658))
    feather.move(to: NSPoint(x: 529, y: 563))
    feather.line(to: NSPoint(x: 731, y: 563))
    feather.lineWidth = 35
    feather.lineCapStyle = .round
    feather.lineJoinStyle = .round
    feather.stroke()
    NSGraphicsContext.restoreGraphicsState()
    let data = bitmap.representation(using: .png, properties: [:])!
    try data.write(to: URL(fileURLWithPath: output).appendingPathComponent(name + ".png"))
}
