import express from 'express';
import { createServer } from 'http';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const expressApp = express();
  const httpServer = createServer(expressApp);

  expressApp.all(/.*/, (req, res) => {
    return handle(req, res);
  });

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`> BioChess ready on http://0.0.0.0:${port}`);
  });
});
