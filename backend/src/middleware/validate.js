/**
 * Factory de validation Joi pour les requêtes
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], { abortEarly: false, stripUnknown: true });
    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message,
      }));
      return res.status(400).json({ error: 'VALIDATION_ERROR', details });
    }
    req[source] = value;
    next();
  };
}

module.exports = { validate };
