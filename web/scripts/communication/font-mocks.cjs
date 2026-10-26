const path = require("node:path");

const localFont = path.resolve(__dirname, "../../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2");

module.exports = new Proxy(
  {},
  {
    get() {
      return `/* latin */\n@font-face { font-family: 'Local build font'; src: url(${localFont}); font-weight: 100 900; font-style: normal; }`;
    },
  },
);
