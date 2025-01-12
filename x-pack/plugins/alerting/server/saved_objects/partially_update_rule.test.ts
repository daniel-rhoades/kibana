/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  SavedObjectsClientContract,
  ISavedObjectsRepository,
  SavedObjectsErrorHelpers,
} from '@kbn/core/server';

import { partiallyUpdateRule, PartiallyUpdateableRuleAttributes } from './partially_update_rule';
import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import { RULE_SAVED_OBJECT_TYPE } from '.';

const MockSavedObjectsClientContract = savedObjectsClientMock.create();
const MockISavedObjectsRepository =
  MockSavedObjectsClientContract as unknown as jest.Mocked<ISavedObjectsRepository>;

describe('partially_update_rule', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  for (const [soClientName, soClient] of Object.entries(getMockSavedObjectClients()))
    describe(`using ${soClientName}`, () => {
      test('should work with no options', async () => {
        soClient.update.mockResolvedValueOnce(MockUpdateValue);

        await partiallyUpdateRule(soClient, MockRuleId, DefaultAttributes);
        expect(soClient.update).toHaveBeenCalledWith(
          RULE_SAVED_OBJECT_TYPE,
          MockRuleId,
          DefaultAttributes,
          {}
        );
      });

      test('should work with extraneous attributes ', async () => {
        const attributes = InvalidAttributes as unknown as PartiallyUpdateableRuleAttributes;
        soClient.update.mockResolvedValueOnce(MockUpdateValue);

        await partiallyUpdateRule(soClient, MockRuleId, attributes);
        expect(soClient.update).toHaveBeenCalledWith(
          RULE_SAVED_OBJECT_TYPE,
          MockRuleId,
          DefaultAttributes,
          {}
        );
      });

      test('should handle SO errors', async () => {
        soClient.update.mockRejectedValueOnce(new Error('wops'));

        await expect(
          partiallyUpdateRule(soClient, MockRuleId, DefaultAttributes)
        ).rejects.toThrowError('wops');
      });

      test('should handle the version option', async () => {
        soClient.update.mockResolvedValueOnce(MockUpdateValue);

        await partiallyUpdateRule(soClient, MockRuleId, DefaultAttributes, { version: '1.2.3' });
        expect(soClient.update).toHaveBeenCalledWith(
          RULE_SAVED_OBJECT_TYPE,
          MockRuleId,
          DefaultAttributes,
          {
            version: '1.2.3',
          }
        );
      });

      test('should handle the ignore404 option', async () => {
        const err = SavedObjectsErrorHelpers.createGenericNotFoundError();
        soClient.update.mockRejectedValueOnce(err);

        await partiallyUpdateRule(soClient, MockRuleId, DefaultAttributes, { ignore404: true });
        expect(soClient.update).toHaveBeenCalledWith(
          RULE_SAVED_OBJECT_TYPE,
          MockRuleId,
          DefaultAttributes,
          {}
        );
      });

      test('should handle the namespace option', async () => {
        soClient.update.mockResolvedValueOnce(MockUpdateValue);

        await partiallyUpdateRule(soClient, MockRuleId, DefaultAttributes, {
          namespace: 'bat.cave',
        });
        expect(soClient.update).toHaveBeenCalledWith(
          RULE_SAVED_OBJECT_TYPE,
          MockRuleId,
          DefaultAttributes,
          {
            namespace: 'bat.cave',
          }
        );
      });
    });
});

function getMockSavedObjectClients(): Record<
  string,
  jest.Mocked<SavedObjectsClientContract | ISavedObjectsRepository>
> {
  return {
    SavedObjectsClientContract: MockSavedObjectsClientContract,
    // doesn't appear to be a mock for this, but it's basically the same as the above,
    // so just cast it to make sure we catch any type errors
    ISavedObjectsRepository: MockISavedObjectsRepository,
  };
}

const DefaultAttributes = {
  scheduledTaskId: 'scheduled-task-id',
  muteAll: true,
  mutedInstanceIds: ['muted-instance-id-1', 'muted-instance-id-2'],
  updatedBy: 'someone',
  updatedAt: '2019-02-12T21:01:22.479Z',
};

const InvalidAttributes = { ...DefaultAttributes, foo: 'bar' };

const MockRuleId = 'rule-id';

const MockUpdateValue = {
  id: MockRuleId,
  type: RULE_SAVED_OBJECT_TYPE,
  attributes: {
    actions: [],
    scheduledTaskId: 'scheduled-task-id',
  },
  references: [],
};
