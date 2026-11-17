const n = require("net")
n.createServer((s) => s.end("220 test\r\n")).listen(2525, "127.0.0.1")
n.createServer((s) => s.end("* OK test\r\n")).listen(1143, "127.0.0.1")
setInterval(() => {}, 1000)
