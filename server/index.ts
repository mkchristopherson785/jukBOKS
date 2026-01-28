import express from "express";
import cors from "cors";
import routes from "./routes";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";

async function createServer() {
  const app = express();
  const PORT = 5000;

  app.use(cors());
  app.use(express.json());

  // Setup Replit Auth (must come before other routes)
  await setupAuth(app);
  registerAuthRoutes(app);

  app.use(routes);

  if (isProduction) {
    const distPath = path.resolve(__dirname, "../public");
    app.use(express.static(distPath));
    
    app.get("*", (req, res) => {
      if (!req.path.startsWith("/api/")) {
        res.sendFile(path.join(distPath, "index.html"));
      }
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    
    const vite = await createViteServer({
      root: path.resolve(__dirname, "../client"),
      server: {
        middlewareMode: true,
        hmr: { port: 5001 },
      },
      appType: "spa",
    });

    app.use(vite.middlewares);

    app.use("*", async (req, res, next) => {
      try {
        const url = req.originalUrl;
        
        if (url.startsWith("/api/")) {
          return next();
        }

        const htmlPath = path.resolve(__dirname, "../client/index.html");
        let template = await fs.promises.readFile(htmlPath, "utf-8");
        template = await vite.transformIndexHtml(url, template);

        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        console.error(e);
        res.status(500).end(e.message);
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Jukboks server running on http://0.0.0.0:${PORT}`);
  });
}

createServer();
