const express = require('express');
const router = express.Router();
const pool = require('../db');

// Crear partida solo
router.post('/solo', async (req, res) => {
  const { player_id } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO games (player1_id, mode, state) VALUES ($1, $2, $3) RETURNING *',
      [player_id, 'solo', 'in_progress']
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error al crear partida');
  }
});

module.exports = router;
