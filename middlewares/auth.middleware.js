const jwt = require('jsonwebtoken');

// Verifica que el usuario esté logueado
const verificarToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    console.log(`[AUTH ERROR] No authorization header provided for ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado' });
  }

  // Separar "Bearer" del token
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : authHeader;

  try {
    const verificado = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = verificado;
    console.log(`[AUTH OK] Usuario ${verificado.id} autenticado para ${req.method} ${req.path}`);
    next();
  } catch (error) {
    console.log(`[AUTH ERROR] Token inválido o expirado:`, error.message);
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

// Verifica que el usuario sea administrador
const verificarAdmin = (req, res, next) => {
  if (req.usuario.rol !== 'admin') {
    console.log(`[AUTH ERROR] Usuario ${req.usuario.id} no es admin para ${req.method} ${req.path}`);
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol administrador' });
  }
  console.log(`[AUTH OK] Usuario ${req.usuario.id} es admin`);
  next();
};

module.exports = { verificarToken, verificarAdmin };