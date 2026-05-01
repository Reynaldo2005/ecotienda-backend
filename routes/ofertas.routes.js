const express = require('express');
const router = express.Router();
const {
  obtenerOfertas, reclamarOferta, crearOferta,
  obtenerReclamos, cambiarEstadoReclamo, eliminarOferta
} = require('../controllers/ofertas.controller');
const { verificarToken, verificarAdmin } = require('../middlewares/auth.middleware');
const upload = require('../config/upload');

// Rutas del cliente
router.get('/', verificarToken, obtenerOfertas);
router.post('/reclamar', verificarToken, reclamarOferta);

// Rutas del admin
router.post('/', verificarToken, verificarAdmin, crearOferta);
router.get('/reclamos', verificarToken, verificarAdmin, obtenerReclamos);
router.put('/reclamos/:id', verificarToken, verificarAdmin, cambiarEstadoReclamo);
router.delete('/:id', verificarToken, verificarAdmin, eliminarOferta);

// Ver mis reclamos (cliente)
router.get('/mis-reclamos', verificarToken, async (req, res) => {
  try {
    const [reclamos] = await db.query(`
      SELECT r.id, o.titulo AS oferta, r.estado, r.fecha
      FROM reclamos_oferta r
      JOIN ofertas o ON r.oferta_id = o.id
      WHERE r.usuario_id = ?
      ORDER BY r.fecha DESC
    `, [req.usuario.id]);
    res.json(reclamos);
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
});

module.exports = router;

// Subir imagen (admin)
router.post('/upload-imagen', verificarToken, verificarAdmin, upload.single('imagen'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ninguna imagen' });
  }
  const imageUrl = `http://localhost:3000/uploads/${req.file.filename}`;
  res.json({ mensaje: 'Imagen subida correctamente', url: imageUrl });
});