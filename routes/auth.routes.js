const express = require('express');
const router = express.Router();
const { registro, login } = require('../controllers/auth.controller');
const { verificarToken } = require('../middlewares/auth.middleware');
const upload = require('../config/upload');
const db = require('../config/db');

router.post('/registro', registro);
router.post('/login', login);

// Subir foto de perfil
router.post('/foto-perfil', verificarToken, upload.single('foto'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ninguna imagen' });
  }
  try {
    const fotoUrl = `http://localhost:3000/uploads/${req.file.filename}`;
    await db.query(
      'UPDATE usuarios SET foto_perfil = ? WHERE id = ?',
      [fotoUrl, req.usuario.id]
    );
    res.json({ mensaje: 'Foto de perfil actualizada', url: fotoUrl });
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
});

// Obtener foto de perfil actual
router.get('/mi-foto', verificarToken, async (req, res) => {
  try {
    const [usuarios] = await db.query(
      'SELECT foto_perfil FROM usuarios WHERE id = ?',
      [req.usuario.id]
    );
    res.json({ foto_perfil: usuarios[0]?.foto_perfil || null });
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
});

module.exports = router;