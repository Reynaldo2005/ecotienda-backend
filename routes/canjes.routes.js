const express = require('express');
const router = express.Router();
const { solicitarCanje, obtenerMisCanjes, obtenerCanjesPendientes, cambiarEstado, cancelarCanje } = require('../controllers/canjes.controller');
const { verificarToken, verificarAdmin } = require('../middlewares/auth.middleware');
const db = require('../config/db');

// Rutas del cliente
router.post('/', verificarToken, solicitarCanje);
router.get('/mis-canjes', verificarToken, obtenerMisCanjes);

// Rutas del admin
router.get('/pendientes', verificarToken, verificarAdmin, obtenerCanjesPendientes);
router.put('/:id/estado', verificarToken, verificarAdmin, cambiarEstado);
router.put('/:id/cancelar', verificarToken, verificarAdmin, cancelarCanje);
router.delete('/:id', verificarToken, verificarAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const [canje] = await db.query(
      'SELECT id, estado FROM canjes WHERE id = ?', [id]
    );
    if (canje.length === 0) {
      return res.status(404).json({ error: 'Canje no encontrado' });
    }
    if (canje[0].estado !== 'entregado') {
      return res.status(400).json({ error: 'Solo se pueden eliminar canjes entregados' });
    }
    await db.query('DELETE FROM canjes WHERE id = ?', [id]);
    res.json({ mensaje: 'Notificación eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error en el servidor: ' + error.message });
  }
});

module.exports = router;