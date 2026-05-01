const express = require('express');
const router = express.Router();
const { obtenerProductos, obtenerProductoPorId, crearProducto, editarProducto, eliminarProducto } = require('../controllers/productos.controller');
const { verificarToken, verificarAdmin } = require('../middlewares/auth.middleware');

// Rutas públicas (cualquier usuario logueado)
router.get('/', verificarToken, obtenerProductos);
router.get('/:id', verificarToken, obtenerProductoPorId);

// Rutas solo admin
router.post('/', verificarToken, verificarAdmin, crearProducto);
router.put('/:id', verificarToken, verificarAdmin, editarProducto);
router.delete('/:id', verificarToken, verificarAdmin, eliminarProducto);

module.exports = router;