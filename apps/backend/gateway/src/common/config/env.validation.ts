import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
    HTTP_PORT: Joi.number().default(3000),
    JWT_SECRET: Joi.string().required(),
    
    AUTH_SERVICE_HOST: Joi.string().default('localhost'),
    AUTH_SERVICE_PORT: Joi.number().default(3001)
})