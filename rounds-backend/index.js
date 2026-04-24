const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'rounds-backend',
    mode: 'maintenance',
    timestamp: Date.now(),
  });
});

app.use('/rounds', (req, res) => {
  res.status(503).json({
    success: false,
    error: 'Rounds service paused during backend rebuild.',
  });
});

const PORT = Number(process.env.PORT || 3011);
app.listen(PORT, () => {
  console.log(`[Rounds-Backend] Maintenance mode on port ${PORT}`);
});
