import { validate } from 'class-validator';
import { LogoutBodyDto, LogoutDto } from './logout.dto';

describe('DTO de logout', () => {
  it('acepta un cuerpo HTTP vacío pero exige userId en el payload interno', async () => {
    await expect(validate(new LogoutBodyDto())).resolves.toEqual([]);

    const internal = new LogoutDto();
    await expect(validate(internal)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'userId' })]),
    );
  });
});
