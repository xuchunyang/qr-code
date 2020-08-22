// API
async function encode(text) {
  const qr = require("qrcode");
  const url = await qr.toDataURL(text);
  if (!url.startsWith("data:image/png;base64,")) {
    throw new Error("qrcode.toDataURL should return data url with image/png encoding");
  }
  const data = url.slice(url.indexOf(",") + 1);
  const buffer = Buffer.from(data, "base64");
  return buffer;
}

async function decode(buffer) {
  const img = await require("sharp")(buffer).ensureAlpha().raw();
  const { width, height } = await img.metadata();
  const data = await img.toBuffer();
  // require("assert").strict.equal(width * height * 4, buffer.length);
  const code = require("jsqr")(data, width, height);
  return code;
}

if (!module.parent) {
  console.log("testing...");
  (async () => {
    require("assert").strict.equal(
      (await decode(await encode("hello"))).data,
      "hello")
  })();
}

// Server
async function encodeHandler(r, s) {
  s.setHeader("Access-Control-Allow-Origin", "*");
  s.setHeader("Cache-Control", "s-maxage=31536000");

  const myURL = new URL(r.url, "http://this-does-not-matter");
  const text = myURL.searchParams.get("text");
  console.log(text, r.url);
  if (!text) {
    s.statusCode = 400;
    s.setHeader("Content-Type", "application/json");
    s.end(json({error: "Missing argument: text"}));
    return;
  }

  try {
    const buffer = await encode(text);
    s.setHeader("Content-Type", "image/png");
    s.end(buffer);
    return;
  } catch (e) {
    s.statusCode = 500;
    s.setHeader("Content-Type", "application/json");
    s.end(json({error: `Encode error: ${e.message}`}));
    return;
  }
}

// require("http").createServer(encodeHandler).listen(3000);

function decodeHandler(r, s) {
  if (r.method === "OPTIONS") {
    s.setHeader("Access-Control-Allow-Origin", "*");
    // not sure about these two headers
    s.setHeader("Access-Control-Allow-Methods", "*");
    s.setHeader("Access-Control-Allow-Headers", "*");
    s.end();
    return;
  }

  s.setHeader("Access-Control-Allow-Origin", "*");
  // XXX Useless? POST can't use cache?
  s.setHeader("Cache-Control", "s-maxage=31536000");

  if (r.method !== "POST") {
    s.statusCode = 400;
    s.setHeader("Content-Type", "application/json");
    s.end(json({error: "Wrong HTTP Method, expect POST"}));
    return;
  }

  let chunks = [];
  r.on("data", chunk => chunks.push(chunk));
  r.on("end", async () => {
    const buffer = Buffer.concat(chunks);
    if (buffer.length === 0) {
      s.statusCode = 400;
      s.setHeader("Content-Type", "application/json");
      s.end(json({error: "Missing POST body, expect image data"}));
      return;      
    }
    try {
      const code = await decode(buffer);
      console.log("Code", code);
      if (!code) {
        s.statusCode = 400;
        s.setHeader("Content-Type", "application/json");
        s.end(json({error: "No QR code found"}));
        return;
      }
      s.statusCode = 200;
      s.setHeader("Content-Type", "application/json");
      s.end(json({data: code.data}));
      return;
    } catch (e) {
      s.statusCode = 400;
      s.setHeader("Content-Type", "application/json");
      s.end(json({error: `Decode error: ${e.message}`}));
      return;
    }
  })
}

// require("http").createServer(decodeHandler).listen(3000);

function json(data) {
  return JSON.stringify(data, null, 2);
}

module.exports = {
  encodeHandler,
  decodeHandler
};
