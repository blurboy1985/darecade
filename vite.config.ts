export default {
  server: {
    proxy: { "/api": { target: "http://127.0.0.1:4173", ws: true } },
  },
};
