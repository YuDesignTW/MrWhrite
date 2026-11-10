let posterFont;
export async function loadIGFonts(design) {
  if (design?.style !== "graphic") {
    await document.fonts?.ready;
    return;
  }
  if (!posterFont) {
    posterFont = new FontFace(
      "Jisto Poster",
      'url("/fonts/NotoSansTC-Variable.ttf")',
      { weight: "100 900" },
    )
      .load()
      .then((face) => {
        document.fonts.add(face);
        return face;
      })
      .catch(() => {
        posterFont = null;
        throw new Error("海報字型載入失敗，請重試；尚未輸出圖片。");
      });
  }
  await posterFont;
}
