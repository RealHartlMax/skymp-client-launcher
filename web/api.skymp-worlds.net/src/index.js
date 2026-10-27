'use strict';

const express = require('express');
const serversRouter = require('./routes/servers');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/servers', serversRouter);

app.listen(PORT, () => {
  console.log(`SkyMP Master Server running on port ${PORT}`);
});

module.exports = app;
