import type { BetterAuthPlugin } from 'better-auth'

export const dashboardPlugin = () =>
  ({
    id: 'dashboard',
    schema: {
      costSnapshot: {
        fields: {
          year: { type: 'number', required: true },
          month: { type: 'number', required: true },
          totalMinor: { type: 'number', required: true },
          currency: { type: 'string', required: true },
          userId: {
            type: 'string',
            required: true,
            references: { model: 'user', field: 'id', onDelete: 'cascade' },
          },
          createdAt: { type: 'date', required: true },
        },
        indexes: [
          { fields: ['userId', 'year', 'month'], unique: true },
          { fields: ['userId'] },
        ],
      },
    },
  }) satisfies BetterAuthPlugin
