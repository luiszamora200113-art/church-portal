require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const notificationRoutes = require('./routes/notifications');
const cellRoutes = require('./routes/cells');
const financeRoutes = require('./routes/finance');
const dutyRoutes = require('./routes/duties');
const titheRoutes = require('./routes/tithe');
const reportRoutes = require('./routes/reports');
const scheduleRoutes = require('./routes/schedules');
const recordRoutes = require('./routes/records');
const customTemplateRoutes = require('./routes/custom-templates');
const churchInfoRoutes = require('./routes/church-info');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/cells', cellRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/duties', dutyRoutes);
app.use('/api/tithe', titheRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/custom-templates', customTemplateRoutes);
app.use('/api/church-info', churchInfoRoutes);

// Sirve el frontend ya compilado (frontend/dist) desde este mismo servidor,
// para que todo el portal viva en un solo servicio con un solo link.
const frontendDist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Servidor del portal escuchando en el puerto ${PORT}`);
});
