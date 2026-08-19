import { Role } from '@prisma/client';

import { UsuarioAutenticado } from '../common/decorators/current-user.decorator';

/**
 * Identidades de sessão por papel.
 *
 * Existe porque escopo de papel entra em quase todo caso de teste: os services
 * recebem `UsuarioAutenticado` como parâmetro, e é isso que permite exercitar a
 * segunda camada de autorização (o escopo do CLIENTE dentro do service) sem
 * levantar o Nest nem forjar um JWT.
 *
 * Atenção ao `id`: ele é o `sub` do token, que é o id na tabela `Cliente` **ou**
 * na `Funcionario` — sequências independentes. Por isso os helpers usam faixas
 * separadas por padrão, para que um teste que confunda as duas falhe em vez de
 * passar por coincidência numérica.
 */
export const admin = (id = 1): UsuarioAutenticado => ({
  id,
  nome: 'Ana Administradora',
  email: 'ana@procertocp.com.br',
  role: Role.ADMIN,
});

export const funcionario = (id = 2): UsuarioAutenticado => ({
  id,
  nome: 'Bruno Analista',
  email: 'bruno@procertocp.com.br',
  role: Role.FUNCIONARIO,
});

export const cliente = (id = 100): UsuarioAutenticado => ({
  id,
  nome: 'Indústria Cliente Ltda',
  email: `cliente${id}@exemplo.com.br`,
  role: Role.CLIENTE,
});
