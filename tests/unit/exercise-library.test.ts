/**
 * Unit tests for Exercise Library Service.
 *
 * Validates:
 * - Search returns global + user's private, excludes other users' private (Req 7.1, 7.3)
 * - Create requires name and primary_muscle_group (Req 7.2, 8.1, 8.2)
 * - Update/Delete reject global exercises (Req 7.4)
 * - getExerciseById visibility check
 */
import { describe, expect, it, vi } from 'vitest';

import {
    createExercise,
    deleteExercise,
    ExerciseLibraryError,
    getExerciseById,
    searchExercises,
    updateExercise,
} from '@/services/exercise-library';

// --- Mock Supabase Client Builder ---

function createMockClient(options: {
  selectData?: unknown[] | unknown | null;
  selectError?: { message: string } | null;
  insertData?: unknown | null;
  insertError?: { message: string } | null;
  updateData?: unknown | null;
  updateError?: { message: string } | null;
  deleteError?: { message: string } | null;
} = {}) {
  const {
    selectData = null,
    selectError = null,
    insertData = null,
    insertError = null,
    updateData = null,
    updateError = null,
    deleteError = null,
  } = options;

  // Build chainable mock for select queries
  const selectChain = {
    or: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: selectData, error: selectError }),
    then: undefined as unknown, // force await to resolve
  };
  // When not calling .single(), resolve the chain itself
  Object.defineProperty(selectChain, 'then', {
    get() {
      return (resolve: (v: unknown) => void) =>
        resolve({ data: Array.isArray(selectData) ? selectData : selectData ? [selectData] : [], error: selectError });
    },
  });

  const insertChain = {
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: insertData, error: insertError }),
    }),
  };

  const updateChain = {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: updateData, error: updateError }),
    }),
  };

  const deleteChain = {
    eq: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  };
  Object.defineProperty(deleteChain, 'then', {
    get() {
      return (resolve: (v: unknown) => void) =>
        resolve({ error: deleteError });
    },
  });

  const client = {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      insert: vi.fn().mockReturnValue(insertChain),
      update: vi.fn().mockReturnValue(updateChain),
      delete: vi.fn().mockReturnValue(deleteChain),
    }),
  };

  return client as unknown as any;
}

/**
 * A more realistic mock that simulates chaining for the exercise-library service.
 * Uses callback-based approach to handle different queries within one test.
 */
function createFlexibleMockClient(responses: {
  search?: { data: unknown[] | null; error: { message: string } | null };
  getById?: { data: unknown | null; error: { message: string } | null };
  insert?: { data: unknown | null; error: { message: string } | null };
  update?: { data: unknown | null; error: { message: string } | null };
  delete?: { error: { message: string } | null };
}) {
  // The exercise-library service uses method chaining. We create a chainable mock.
  const buildChain = (finalResult: { data?: unknown; error?: unknown }) => {
    const chain: Record<string, any> = {};
    chain.or = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.ilike = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockResolvedValue(finalResult);
    // Make the chain thenable for non-single queries
    chain.then = (resolve: (v: unknown) => void) => resolve(finalResult);
    return chain;
  };

  let callCount = 0;
  const client = {
    from: vi.fn().mockImplementation(() => {
      callCount++;
      return {
        select: vi.fn().mockImplementation(() => {
          // First select call is typically the check/search, second might be different
          if (responses.search) {
            return buildChain(responses.search);
          }
          return buildChain({ data: null, error: null });
        }),
        insert: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(responses.insert ?? { data: null, error: null }),
          }),
        })),
        update: vi.fn().mockImplementation(() => {
          const chain = buildChain(responses.update ?? { data: null, error: null });
          chain.select = vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(responses.update ?? { data: null, error: null }),
          });
          return chain;
        }),
        delete: vi.fn().mockImplementation(() => {
          const chain: Record<string, any> = {};
          chain.eq = vi.fn().mockReturnValue(chain);
          chain.then = (resolve: (v: unknown) => void) => resolve(responses.delete ?? { error: null });
          return chain;
        }),
      };
    }),
  };

  return client as unknown as any;
}

// --- Test Data ---

const userId = 'user-123';
const otherUserId = 'user-456';

const globalExercise = {
  id: 'ex-global-1',
  user_id: null,
  name: 'Bench Press',
  primary_muscle_group: 'chest',
  secondary_muscle_groups: ['triceps', 'shoulders'],
  instructions: 'Lie on bench, lower bar to chest, press up',
  notes: null,
  is_global: true,
};

const userExercise = {
  id: 'ex-user-1',
  user_id: userId,
  name: 'Custom Push-up',
  primary_muscle_group: 'chest',
  secondary_muscle_groups: ['triceps'],
  instructions: 'A custom variation',
  notes: 'My variant',
  is_global: false,
};

// --- Tests ---

describe('Exercise Library Service', () => {
  describe('searchExercises', () => {
    it('returns global and user exercises', async () => {
      const mockData = [globalExercise, userExercise];
      const chain: Record<string, any> = {};
      chain.or = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.ilike = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);

      // Make the final chain awaitable
      const promise = Promise.resolve({ data: mockData, error: null });
      Object.assign(chain, { then: promise.then.bind(promise), catch: promise.catch.bind(promise) });

      const client = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue(chain),
        }),
      } as unknown as any;

      const result = await searchExercises(client, userId);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual(expect.objectContaining({ name: 'Bench Press', is_global: true }));
      expect(result).toContainEqual(expect.objectContaining({ name: 'Custom Push-up', user_id: userId }));
    });

    it('applies name filter via ilike when query provided', async () => {
      const chain: Record<string, any> = {};
      chain.or = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.ilike = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);

      const promise = Promise.resolve({ data: [globalExercise], error: null });
      Object.assign(chain, { then: promise.then.bind(promise), catch: promise.catch.bind(promise) });

      const client = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue(chain),
        }),
      } as unknown as any;

      await searchExercises(client, userId, { query: 'Bench' });

      expect(chain.ilike).toHaveBeenCalledWith('name', '%Bench%');
    });

    it('applies muscle group filter when provided', async () => {
      const chain: Record<string, any> = {};
      chain.or = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.ilike = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);

      const promise = Promise.resolve({ data: [], error: null });
      Object.assign(chain, { then: promise.then.bind(promise), catch: promise.catch.bind(promise) });

      const client = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue(chain),
        }),
      } as unknown as any;

      await searchExercises(client, userId, { muscleGroup: 'chest' });

      expect(chain.eq).toHaveBeenCalledWith('primary_muscle_group', 'chest');
    });

    it('uses or filter with is_global=true and user_id to exclude other users', async () => {
      const chain: Record<string, any> = {};
      chain.or = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.ilike = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);

      const promise = Promise.resolve({ data: [], error: null });
      Object.assign(chain, { then: promise.then.bind(promise), catch: promise.catch.bind(promise) });

      const client = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue(chain),
        }),
      } as unknown as any;

      await searchExercises(client, userId);

      expect(chain.or).toHaveBeenCalledWith(`is_global.eq.true,user_id.eq.${userId}`);
    });

    it('defaults limit to 50', async () => {
      const chain: Record<string, any> = {};
      chain.or = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.ilike = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);

      const promise = Promise.resolve({ data: [], error: null });
      Object.assign(chain, { then: promise.then.bind(promise), catch: promise.catch.bind(promise) });

      const client = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue(chain),
        }),
      } as unknown as any;

      await searchExercises(client, userId);

      expect(chain.limit).toHaveBeenCalledWith(50);
    });

    it('throws DB_ERROR on Supabase error', async () => {
      const chain: Record<string, any> = {};
      chain.or = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.ilike = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockReturnValue(chain);

      const promise = Promise.resolve({ data: null, error: { message: 'Connection failed' } });
      Object.assign(chain, { then: promise.then.bind(promise), catch: promise.catch.bind(promise) });

      const client = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue(chain),
        }),
      } as unknown as any;

      await expect(searchExercises(client, userId)).rejects.toThrow(ExerciseLibraryError);
      await expect(searchExercises(client, userId)).rejects.toMatchObject({ code: 'DB_ERROR' });
    });
  });

  describe('createExercise', () => {
    it('creates a private exercise with valid input', async () => {
      const createdExercise = { ...userExercise, id: 'new-ex-1' };
      const client = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: createdExercise, error: null }),
            }),
          }),
        }),
      } as unknown as any;

      const result = await createExercise(client, userId, {
        name: 'Custom Push-up',
        primary_muscle_group: 'chest',
        secondary_muscle_groups: ['triceps'],
        instructions: 'A custom variation',
        notes: 'My variant',
      });

      expect(result).toEqual(createdExercise);
      expect(client.from).toHaveBeenCalledWith('exercises');
    });

    it('rejects when name is missing', async () => {
      const client = { from: vi.fn() } as unknown as any;

      await expect(
        createExercise(client, userId, {
          name: '',
          primary_muscle_group: 'chest',
        })
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: 'Exercise name is required' });
    });

    it('rejects when name is only whitespace', async () => {
      const client = { from: vi.fn() } as unknown as any;

      await expect(
        createExercise(client, userId, {
          name: '   ',
          primary_muscle_group: 'chest',
        })
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects when primary_muscle_group is missing', async () => {
      const client = { from: vi.fn() } as unknown as any;

      await expect(
        createExercise(client, userId, {
          name: 'Valid Name',
          primary_muscle_group: '',
        })
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: 'Primary muscle group is required' });
    });

    it('rejects when primary_muscle_group is only whitespace', async () => {
      const client = { from: vi.fn() } as unknown as any;

      await expect(
        createExercise(client, userId, {
          name: 'Valid Name',
          primary_muscle_group: '   ',
        })
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('trims name and primary_muscle_group before saving', async () => {
      const insertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: userExercise, error: null }),
        }),
      });

      const client = {
        from: vi.fn().mockReturnValue({ insert: insertMock }),
      } as unknown as any;

      await createExercise(client, userId, {
        name: '  Custom Push-up  ',
        primary_muscle_group: '  chest  ',
      });

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Custom Push-up',
          primary_muscle_group: 'chest',
          is_global: false,
          user_id: userId,
        })
      );
    });
  });

  describe('updateExercise', () => {
    it('rejects update of global exercise', async () => {
      // First call: fetch the exercise (returns global)
      const selectChain: Record<string, any> = {};
      selectChain.eq = vi.fn().mockReturnValue(selectChain);
      selectChain.single = vi.fn().mockResolvedValue({ data: globalExercise, error: null });

      const client = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue(selectChain),
        }),
      } as unknown as any;

      await expect(
        updateExercise(client, userId, globalExercise.id, { name: 'New Name' })
      ).rejects.toMatchObject({ code: 'GLOBAL_EXERCISE' });
    });

    it('rejects update when exercise not found', async () => {
      const selectChain: Record<string, any> = {};
      selectChain.eq = vi.fn().mockReturnValue(selectChain);
      selectChain.single = vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const client = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue(selectChain),
        }),
      } as unknown as any;

      await expect(
        updateExercise(client, userId, 'nonexistent-id', { name: 'New Name' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('rejects empty name on update', async () => {
      const selectChain: Record<string, any> = {};
      selectChain.eq = vi.fn().mockReturnValue(selectChain);
      selectChain.single = vi.fn().mockResolvedValue({ data: userExercise, error: null });

      const client = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue(selectChain),
        }),
      } as unknown as any;

      await expect(
        updateExercise(client, userId, userExercise.id, { name: '' })
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('updates user exercise successfully', async () => {
      const updatedExercise = { ...userExercise, name: 'Updated Name' };

      // selectChain for the initial fetch
      const selectChain: Record<string, any> = {};
      selectChain.eq = vi.fn().mockReturnValue(selectChain);
      selectChain.single = vi.fn().mockResolvedValue({ data: userExercise, error: null });

      // updateChain for the update call
      const updateChain: Record<string, any> = {};
      updateChain.eq = vi.fn().mockReturnValue(updateChain);
      updateChain.select = vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: updatedExercise, error: null }),
      });

      const client = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue(selectChain),
          update: vi.fn().mockReturnValue(updateChain),
        }),
      } as unknown as any;

      const result = await updateExercise(client, userId, userExercise.id, { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
    });
  });

  describe('deleteExercise', () => {
    it('rejects deletion of global exercise', async () => {
      const selectChain: Record<string, any> = {};
      selectChain.eq = vi.fn().mockReturnValue(selectChain);
      selectChain.single = vi.fn().mockResolvedValue({ data: globalExercise, error: null });

      const client = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue(selectChain),
        }),
      } as unknown as any;

      await expect(
        deleteExercise(client, userId, globalExercise.id)
      ).rejects.toMatchObject({ code: 'GLOBAL_EXERCISE' });
    });

    it('rejects deletion when exercise not found', async () => {
      const selectChain: Record<string, any> = {};
      selectChain.eq = vi.fn().mockReturnValue(selectChain);
      selectChain.single = vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const client = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue(selectChain),
        }),
      } as unknown as any;

      await expect(
        deleteExercise(client, userId, 'nonexistent-id')
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('deletes user exercise successfully', async () => {
      const selectChain: Record<string, any> = {};
      selectChain.eq = vi.fn().mockReturnValue(selectChain);
      selectChain.single = vi.fn().mockResolvedValue({ data: userExercise, error: null });

      const deleteChain: Record<string, any> = {};
      deleteChain.eq = vi.fn().mockReturnValue(deleteChain);
      const deletePromise = Promise.resolve({ error: null });
      Object.assign(deleteChain, { then: deletePromise.then.bind(deletePromise), catch: deletePromise.catch.bind(deletePromise) });

      const client = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue(selectChain),
          delete: vi.fn().mockReturnValue(deleteChain),
        }),
      } as unknown as any;

      await expect(deleteExercise(client, userId, userExercise.id)).resolves.toBeUndefined();
    });
  });

  describe('getExerciseById', () => {
    it('returns a global exercise by ID', async () => {
      const selectChain: Record<string, any> = {};
      selectChain.eq = vi.fn().mockReturnValue(selectChain);
      selectChain.or = vi.fn().mockReturnValue(selectChain);
      selectChain.single = vi.fn().mockResolvedValue({ data: globalExercise, error: null });

      const client = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue(selectChain),
        }),
      } as unknown as any;

      const result = await getExerciseById(client, userId, globalExercise.id);

      expect(result).toEqual(globalExercise);
      expect(selectChain.eq).toHaveBeenCalledWith('id', globalExercise.id);
      expect(selectChain.or).toHaveBeenCalledWith(`is_global.eq.true,user_id.eq.${userId}`);
    });

    it('returns a user-owned exercise by ID', async () => {
      const selectChain: Record<string, any> = {};
      selectChain.eq = vi.fn().mockReturnValue(selectChain);
      selectChain.or = vi.fn().mockReturnValue(selectChain);
      selectChain.single = vi.fn().mockResolvedValue({ data: userExercise, error: null });

      const client = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue(selectChain),
        }),
      } as unknown as any;

      const result = await getExerciseById(client, userId, userExercise.id);

      expect(result).toEqual(userExercise);
    });

    it('throws NOT_FOUND when exercise does not exist', async () => {
      const selectChain: Record<string, any> = {};
      selectChain.eq = vi.fn().mockReturnValue(selectChain);
      selectChain.or = vi.fn().mockReturnValue(selectChain);
      selectChain.single = vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const client = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue(selectChain),
        }),
      } as unknown as any;

      await expect(
        getExerciseById(client, userId, 'nonexistent-id')
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('throws NOT_FOUND for other users private exercise', async () => {
      // The or filter will exclude other users' private exercises,
      // so the query returns no data
      const selectChain: Record<string, any> = {};
      selectChain.eq = vi.fn().mockReturnValue(selectChain);
      selectChain.or = vi.fn().mockReturnValue(selectChain);
      selectChain.single = vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const client = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue(selectChain),
        }),
      } as unknown as any;

      // Trying to access another user's private exercise returns NOT_FOUND
      await expect(
        getExerciseById(client, userId, 'other-user-private-ex')
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
