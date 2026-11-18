import AppKit
import Foundation
let input=URL(fileURLWithPath:CommandLine.arguments[1]), dest=URL(fileURLWithPath:CommandLine.arguments[2],isDirectory:true),assets=URL(fileURLWithPath:CommandLine.arguments[3],isDirectory:true)
struct Slide:Decodable {let title:String;let body:String}
struct Palette:Decodable {let background:String;let foreground:String;let accent:String}
struct Design:Decodable {let style:String;let palette:Palette?;let layout:String?}
struct Branding:Decodable {let label:String;let footer:String}
struct Job:Decodable {let slides:[Slide];let design:Design;let branding:Branding?;let generatedPaths:[String]?}
let job=try JSONDecoder().decode(Job.self,from:Data(contentsOf:input))
func rgb(_ n:Int)->NSColor{NSColor(calibratedRed:CGFloat((n>>16)&255)/255,green:CGFloat((n>>8)&255)/255,blue:CGFloat(n&255)/255,alpha:1)}
func rect(_ r:NSRect,_ c:NSColor){c.setFill();NSBezierPath(rect:r).fill()}
func text(_ text:String,_ box:NSRect,_ size:CGFloat,_ color:NSColor,_ bold:Bool=false)throws{
 let paragraph=NSMutableParagraphStyle();paragraph.lineSpacing=12;paragraph.lineBreakMode = .byWordWrapping
 var point=size
 while point>=min(26,size) {
  let attrs:[NSAttributedString.Key:Any]=[.font:NSFont.systemFont(ofSize:point,weight:bold ? .bold:.regular),.foregroundColor:color,.paragraphStyle:paragraph]
  let measured=(text as NSString).boundingRect(with:NSSize(width:box.width,height:10000),options:[.usesLineFragmentOrigin,.usesFontLeading],attributes:attrs)
  if measured.height<=box.height { (text as NSString).draw(in:box,withAttributes:attrs);return }
  point-=2
 }
 throw NSError(domain:"Carousel",code:1,userInfo:[NSLocalizedDescriptionKey:"文字超出範圍，請縮短文案"])
}
try FileManager.default.createDirectory(at:dest,withIntermediateDirectories:true)
for (i,slide) in job.slides.enumerated(){
 let rep=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:1080,pixelsHigh:1350,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
 let ctx=NSGraphicsContext(bitmapImageRep:rep)!.cgContext;ctx.translateBy(x:0,y:1350);ctx.scaleBy(x:1,y:-1)
 NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(cgContext:ctx,flipped:true)
 let ink=rgb(0x191919),paper=rgb(0xf2ecdf),accent=rgb(job.design.style=="street" ? 0xd8ff31:job.design.style=="surreal" ? 0xf5cc29:0xef321e)
 if let paths=job.generatedPaths {
  guard i<paths.count, let image=NSImage(contentsOfFile:paths[i]) else {throw NSError(domain:"Carousel",code:2)}
  let scale=max(1080/image.size.width,1350/image.size.height),w=image.size.width*scale,h=image.size.height*scale
  image.draw(in:NSRect(x:(1080-w)/2,y:(1350-h)/2,width:w,height:h),from:.zero,operation:.sourceOver,fraction:1,respectFlipped:true,hints:nil)
  let bg=rgb(Int(job.design.palette?.background.dropFirst() ?? "102348",radix:16) ?? 0x102348)
  let fg=rgb(Int(job.design.palette?.foreground.dropFirst() ?? "ffffff",radix:16) ?? 0xffffff)
  let ac=rgb(Int(job.design.palette?.accent.dropFirst() ?? "ff6b2b",radix:16) ?? 0xff6b2b)
  if job.design.layout=="top" {
   rect(NSRect(x:0,y:0,width:1080,height:410),bg)
   NSGradient(starting:bg,ending:bg.withAlphaComponent(0))!.draw(in:NSRect(x:0,y:410,width:1080,height:180),angle:90)
   rect(NSRect(x:65,y:65,width:65,height:7),ac)
   try text(slide.title,NSRect(x:65,y:95,width:950,height:170),i==0 ? 76:66,fg,true)
   try text(slide.body,NSRect(x:65,y:275,width:950,height:205),40,fg)
   rect(NSRect(x:0,y:1275,width:1080,height:75),bg.withAlphaComponent(0.9))
  } else {
  let fade=NSGradient(starting:bg.withAlphaComponent(0),ending:bg)!
  fade.draw(in:NSRect(x:0,y:680,width:1080,height:230),angle:90)
  rect(NSRect(x:0,y:910,width:1080,height:440),bg)
  rect(NSRect(x:65,y:845,width:65,height:7),ac)
  try text(slide.title,NSRect(x:65,y:880,width:950,height:170),i==0 ? 76:66,fg,true)
  try text(slide.body,NSRect(x:65,y:1060,width:950,height:205),40,fg)
  }
  try text("\(job.branding?.label ?? "Mr White")   /   \(String(format:"%02d",i+1)) — \(String(format:"%02d",job.slides.count))     AI 概念示意",NSRect(x:65,y:1290,width:950,height:40),24,fg)
 } else {
 rect(NSRect(x:0,y:0,width:1080,height:1350),paper)
 if job.design.style != "typographic" {let role=i==0 ? "cover":i==job.slides.count-1 ? "closing":"content";let file=assets.appendingPathComponent("\(job.design.style)-\(role).png");if let image=NSImage(contentsOf:file){image.draw(in:NSRect(x:0,y:0,width:1080,height:1350),from:.zero,operation:.sourceOver,fraction:1,respectFlipped:true,hints:nil)}}
 rect(NSRect(x:48,y:140,width:984,height:1040),paper)
 rect(NSRect(x:80,y:180,width:70,height:8),accent)
 try text("\(job.branding?.label ?? "內容研究") / \(String(format:"%02d",i+1))",NSRect(x:80,y:215,width:920,height:55),28,ink,true)
 try text(slide.title,NSRect(x:80,y:315,width:920,height:310),i==0 ? 90:76,ink,true)
 try text(slide.body,NSRect(x:80,y:690,width:920,height:420),48,ink)
 rect(NSRect(x:48,y:1200,width:984,height:100),ink)
 try text("\(job.branding?.label ?? "內容研究")  ·  \(i+1) / \(job.slides.count)  ·  \(job.branding?.footer ?? "待審稿")",NSRect(x:80,y:1225,width:920,height:55),27,paper)
 }
 NSGraphicsContext.restoreGraphicsState()
 let data=rep.representation(using:.png,properties:[:])!;try data.write(to:dest.appendingPathComponent(String(format:"%02d.png",i+1)),options:.atomic)
}
print("Rendered \(job.slides.count) PNG slides")
