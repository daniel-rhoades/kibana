/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ObjectType } from '@kbn/config-schema';
import type {
  RuleActionParams as GenericRuleActionParams,
  RuleTypeParams,
  SanitizedRule,
} from '../../common';
import { CombinedSummarizedAlerts } from '../types';

type ActionTypeParams = Record<string, unknown>;

type Rule = Pick<SanitizedRule<RuleTypeParams>, 'id' | 'name' | 'tags'>;

interface BuildActionParamsArgs<
  RuleActionParams extends GenericRuleActionParams = GenericRuleActionParams
> {
  alerts: CombinedSummarizedAlerts;
  rule: Rule;
  params: RuleActionParams;
  spaceId: string;
  ruleUrl?: string;
}

export interface ConnectorAdapter {
  connectorTypeId: string;
  /**
   * The schema of the action persisted
   * in the rule. The schema will be validated
   * when a rule is created or updated.
   * The schema should be backwards compatible
   * and should never introduce any breaking
   * changes.
   */
  ruleActionParamsSchema: ObjectType;
  buildActionParams: <RuleActionParams extends GenericRuleActionParams>(
    args: BuildActionParamsArgs<RuleActionParams>
  ) => ActionTypeParams;
}
