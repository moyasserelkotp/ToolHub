const express = require('express');
const router = express.Router();
const SwaggerParser = require('@apidevtools/swagger-parser');
const db = require('../db');
const { computeSecurityScore, MINIMUM_SECURITY_SCORE } = require('../services/security');
const { embedTool } = require('../services/embeddings');
const logger = require('../logger');

router.post('/', async (req, res) => {
  const { spec_url, org_id } = req.body;
  if (!spec_url) return res.status(400).json({ error: 'spec_url is required' });

  try {
    const api = await SwaggerParser.dereference(spec_url);
    const servers = api.servers || [{ url: '' }];
    const baseUrl = servers[0].url;
    
    // Determine global auth
    let globalAuthType = 'none';
    if (api.components && api.components.securitySchemes) {
      const schemes = Object.values(api.components.securitySchemes);
      if (schemes.some(s => s.type === 'oauth2')) globalAuthType = 'oauth';
      else if (schemes.some(s => s.type === 'http' && s.scheme === 'bearer')) globalAuthType = 'bearer_token';
      else if (schemes.some(s => s.type === 'apiKey')) globalAuthType = 'api_key';
    }

    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const [path, methods] of Object.entries(api.paths || {})) {
      for (const [method, op] of Object.entries(methods)) {
        if (!['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) continue;

        const name = op.operationId || `${method.toUpperCase()} ${path}`;
        const description = op.summary || op.description || `Auto-imported API endpoint: ${name}`;
        const category = (op.tags && op.tags[0]) ? op.tags[0].toLowerCase() : 'api';
        const endpoint_url = `${baseUrl}${path}`;
        
        let auth_type = globalAuthType;
        if (op.security) {
           if (op.security.length === 0) auth_type = 'none';
        }

        // Build json schema from parameters and requestBody
        const json_schema = { type: 'object', properties: {}, required: [] };
        if (op.parameters) {
          op.parameters.forEach(p => {
            json_schema.properties[p.name] = p.schema || { type: 'string' };
            if (p.description) json_schema.properties[p.name].description = p.description;
            if (p.required) json_schema.required.push(p.name);
          });
        }
        if (op.requestBody && op.requestBody.content && op.requestBody.content['application/json']) {
          const bodySchema = op.requestBody.content['application/json'].schema;
          if (bodySchema && bodySchema.properties) {
             Object.assign(json_schema.properties, bodySchema.properties);
             if (bodySchema.required) json_schema.required.push(...bodySchema.required);
          }
        }

        const score = computeSecurityScore({ auth_type, json_schema, endpoint_url, version: api.info?.version || '1.0.0' });
        
        if (score < MINIMUM_SECURITY_SCORE) {
          skipped++;
          errors.push(`Skipped ${name}: Security score ${score} below minimum threshold of ${MINIMUM_SECURITY_SCORE}`);
          continue;
        }

        try {
          const { rows } = await db.query(
            `INSERT INTO tools (name, description, category, json_schema, auth_type, endpoint_url, version, security_score, org_id, is_public)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [name.slice(0, 50), description, category, JSON.stringify(json_schema), auth_type, endpoint_url, api.info?.version || '1.0.0', score, org_id || null, true]
          );
          const tool = rows[0];

          await db.query(`INSERT INTO tool_health_summary (tool_id, status) VALUES ($1,'unknown') ON CONFLICT DO NOTHING`, [tool.id]);
          await db.query(`INSERT INTO tool_versions (tool_id, version, schema, changelog, is_active) VALUES ($1,$2,$3,$4,true)`, [tool.id, tool.version, JSON.stringify(json_schema), 'Auto-imported']);
          await embedTool(tool.id, `${name} ${description}`);
          
          if (req.app.get('io')) {
            req.app.get('io').emit('tool_registered', { id: tool.id, name: tool.name, category: tool.category, created_at: tool.created_at });
          }
          imported++;
        } catch (dbErr) {
          skipped++;
          if (dbErr.code === '23505') {
            errors.push(`Skipped ${name}: Tool already exists`);
          } else {
            errors.push(`Failed ${name}: ${dbErr.message}`);
          }
        }
      }
    }

    res.json({ imported, skipped, errors });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: 'Failed to parse OpenAPI spec', details: err.message });
  }
});

module.exports = router;
