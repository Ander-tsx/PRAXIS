const express = require('express');
const AWS = require('aws-sdk');

// 1. Configurar región de AWS ANTES de requerir index.js
AWS.config.update({ region: 'us-east-1' });
process.env.AWS_REGION = 'us-east-1';
process.env.PRAXIS_API_BASE_URL =
  process.env.PRAXIS_API_BASE_URL || 'http://localhost:3000/api/alexa';

// 2. Importar index.js después de la configuración
const { skill } = require('./index');

const app = express();
app.use(express.json());

app.post('/', async (req, res) => {
  try {
    const response = await skill.invoke(req.body);
    res.json(response);
  } catch (error) {
    console.error('❌ Error procesando petición:', error);
    res.status(500).send(error.message);
  }
});

// Captura de errores no controlados para evitar caídas silenciosas
process.on('unhandledRejection', (reason) => {
  console.error('💥 UNHANDLED REJECTION:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('💥 UNCAUGHT EXCEPTION:', error);
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`🚀 Skill de Alexa lista en local: http://localhost:${PORT}`);
});
