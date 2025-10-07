const express = require('express');
const router = express.Router();
const pool = require('../db');

// Obtener todas las preguntas
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM questions');
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error al obtener preguntas');
  }
});

module.exports = router;
