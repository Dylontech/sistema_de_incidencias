/** Rutas de catálogos: municipios, zonas, tipos, usuarios y datos de apoyo. */
import { Router } from 'express';
import * as municipios from '../controllers/municipios.controller.js';
import * as tipos from '../controllers/tipos.controller.js';
import * as usuarios from '../controllers/usuarios.controller.js';
import { requiereAdmin, requiereEmpleado, requiereSesion } from '../middlewares/auth.js';

const router = Router();

// Catálogos de presentación (iconos, ejemplos, límites): públicos.
router.get('/catalogos', municipios.catalogos);

router.get('/municipios', requiereSesion, municipios.listar);
router.get('/municipios/:id', requiereSesion, municipios.detalle);
router.get('/municipios/:id/zonas', requiereSesion, municipios.zonas);
router.get('/municipios/:id/colindantes', requiereSesion, municipios.colindantes);
router.get('/municipios/:id/zonas/resumen', requiereEmpleado, municipios.resumenZonas);

router.get('/tipos', requiereSesion, tipos.listar);
router.post('/tipos', requiereEmpleado, tipos.crear);
router.delete('/tipos/:id', requiereEmpleado, tipos.eliminar);

router.get('/usuarios', requiereEmpleado, usuarios.listar);
// Las cuentas del personal las abre y mantiene un administrador.
router.post('/usuarios', requiereAdmin, usuarios.crear);
router.patch('/usuarios/:id', requiereAdmin, usuarios.actualizar);

export default router;
