/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FetchRulesResponse } from '@kbn/security-solution-plugin/public';
import { DETECTION_ENGINE_RULES_URL_FIND } from '@kbn/security-solution-plugin/common';
import type { HttpSetup } from '@kbn/core/public';

export const fetchRuleManagementFilters = async ({
  http,
  signal,
  query,
}: {
  http: HttpSetup;
  signal?: AbortSignal;
  query?: {
    page: number;
    per_page: number;
    sort_field: string;
    sort_order: string;
    filter: string;
  };
}): Promise<FetchRulesResponse> =>
  http.fetch<FetchRulesResponse>(DETECTION_ENGINE_RULES_URL_FIND, {
    method: 'GET',
    version: '2023-10-31',
    signal,
    query,
  });
