import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAutomationRuleBodyDto } from './automation-rule.dto';

describe('CreateAutomationRuleBodyDto', () => {
  it('conserva el value arbitrario de una condición al validar con whitelist', async () => {
    const dto = plainToInstance(CreateAutomationRuleBodyDto, {
      name: 'Regla',
      trigger: { type: 'TASK_DUE_SOON', config: { leadTimeMinutes: 30 } },
      conditions: [{ field: 'status', operator: 'EQUALS', value: 'OPEN' }],
      actions: [{ type: 'SEND_EMAIL', config: { template: 'due-soon' } }],
    });

    await expect(
      validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toHaveLength(0);
    expect(dto.conditions[0].value).toBe('OPEN');
  });
});
