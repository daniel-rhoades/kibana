/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { range as lodashRange, sortBy } from 'lodash';
import { apm, timerange } from '@kbn/apm-synthtrace-client';
import { APIReturnType } from '@kbn/apm-plugin/public/services/rest/create_call_apm_api';
import { ENVIRONMENT_ALL } from '@kbn/apm-plugin/common/environment_filter_values';
import { ApmDocumentType } from '@kbn/apm-plugin/common/document_type';
import { RollupInterval } from '@kbn/apm-plugin/common/rollup';
import { FtrProviderContext } from '../../common/ftr_provider_context';
import archives_metadata from '../../common/fixtures/es_archiver/archives_metadata';
import { SupertestReturnType } from '../../common/apm_api_supertest';

export default function ApiTest({ getService }: FtrProviderContext) {
  const registry = getService('registry');

  const apmApiClient = getService('apmApiClient');
  const synthtrace = getService('synthtraceEsClient');

  const archiveName = 'apm_8.0.0';

  const archiveRange = archives_metadata[archiveName];

  // url parameters
  const archiveStart = archiveRange.start;
  const archiveEnd = archiveRange.end;

  const start = '2023-02-24T00:00:00.000Z';
  const end = '2023-02-24T01:00:00.000Z';

  registry.when(
    'APM Services Overview with a basic license when data is not generated',
    { config: 'basic', archives: [] },
    () => {
      it('handles the empty state', async () => {
        const response = await apmApiClient.readUser({
          endpoint: `GET /internal/apm/services`,
          params: {
            query: {
              start,
              end,
              environment: ENVIRONMENT_ALL.value,
              kuery: '',
              probability: 1,
              documentType: ApmDocumentType.TransactionMetric,
              rollupInterval: RollupInterval.OneMinute,
            },
          },
        });

        expect(response.status).to.be(200);
        expect(response.body.items.length).to.be(0);
        expect(response.body.maxServiceCountExceeded).to.be(false);
        expect(response.body.serviceOverflowCount).to.be(0);
      });
    }
  );

  registry.when(
    'APM Services Overview with a basic license when data is generated',
    { config: 'basic', archives: [] },
    () => {
      let response: {
        status: number;
        body: APIReturnType<'GET /internal/apm/services'>;
      };

      const range = timerange(new Date(start).getTime(), new Date(end).getTime());
      const transactionInterval = range.interval('1s');
      const metricInterval = range.interval('30s');

      const errorInterval = range.interval('5s');

      const multipleEnvServiceProdInstance = apm
        .service({ name: 'multiple-env-service', environment: 'production', agentName: 'go' })
        .instance('multiple-env-service-production');

      const multipleEnvServiceDevInstance = apm
        .service({ name: 'multiple-env-service', environment: 'development', agentName: 'go' })
        .instance('multiple-env-service-development');

      const metricOnlyInstance = apm
        .service({ name: 'metric-only-service', environment: 'production', agentName: 'java' })
        .instance('metric-only-production');

      const errorOnlyInstance = apm
        .service({ name: 'error-only-service', environment: 'production', agentName: 'java' })
        .instance('error-only-production');

      const config = {
        multiple: {
          prod: {
            rps: 4,
            duration: 1000,
          },
          dev: {
            rps: 1,
            duration: 500,
          },
        },
      };

      function checkStats() {
        const multipleEnvService = response.body.items.find(
          (item) => item.serviceName === 'multiple-env-service'
        );

        const totalRps = config.multiple.prod.rps + config.multiple.dev.rps;

        expect(multipleEnvService).to.eql({
          serviceName: 'multiple-env-service',
          transactionType: 'request',
          environments: ['production', 'development'],
          agentName: 'go',
          latency:
            1000 *
            ((config.multiple.prod.duration * config.multiple.prod.rps +
              config.multiple.dev.duration * config.multiple.dev.rps) /
              totalRps),
          throughput: totalRps * 60,
          transactionErrorRate:
            config.multiple.dev.rps / (config.multiple.prod.rps + config.multiple.dev.rps),
        });
      }

      before(async () => {
        return synthtrace.index([
          transactionInterval
            .rate(config.multiple.prod.rps)
            .generator((timestamp) =>
              multipleEnvServiceProdInstance
                .transaction({ transactionName: 'GET /api' })
                .timestamp(timestamp)
                .duration(config.multiple.prod.duration)
                .success()
            ),
          transactionInterval
            .rate(config.multiple.dev.rps)
            .generator((timestamp) =>
              multipleEnvServiceDevInstance
                .transaction({ transactionName: 'GET /api' })
                .timestamp(timestamp)
                .duration(config.multiple.dev.duration)
                .failure()
            ),
          transactionInterval
            .rate(config.multiple.prod.rps)
            .generator((timestamp) =>
              multipleEnvServiceDevInstance
                .transaction({ transactionName: 'non-request', transactionType: 'rpc' })
                .timestamp(timestamp)
                .duration(config.multiple.prod.duration)
                .success()
            ),
          metricInterval.rate(1).generator((timestamp) =>
            metricOnlyInstance
              .appMetrics({
                'system.memory.actual.free': 1,
                'system.cpu.total.norm.pct': 1,
                'system.memory.total': 1,
                'system.process.cpu.total.norm.pct': 1,
              })
              .timestamp(timestamp)
          ),
          errorInterval
            .rate(1)
            .generator((timestamp) =>
              errorOnlyInstance.error({ message: 'Foo' }).timestamp(timestamp)
            ),
        ]);
      });

      after(() => {
        return synthtrace.clean();
      });

      describe('when no additional filters are applied', () => {
        before(async () => {
          response = await apmApiClient.readUser({
            endpoint: 'GET /internal/apm/services',
            params: {
              query: {
                start,
                end,
                environment: ENVIRONMENT_ALL.value,
                kuery: '',
                probability: 1,
                documentType: ApmDocumentType.TransactionMetric,
                rollupInterval: RollupInterval.OneMinute,
              },
            },
          });
        });

        it('returns a successful response', () => {
          expect(response.status).to.be(200);
        });

        it('returns the correct statistics', () => {
          checkStats();
        });

        it('returns services without transaction data', () => {
          const serviceNames = response.body.items.map((item) => item.serviceName);

          expect(serviceNames).to.contain('metric-only-service');

          expect(serviceNames).to.contain('error-only-service');
        });
      });

      describe('when applying an environment filter', () => {
        before(async () => {
          response = await apmApiClient.readUser({
            endpoint: 'GET /internal/apm/services',
            params: {
              query: {
                start,
                end,
                environment: 'production',
                kuery: '',
                probability: 1,
                documentType: ApmDocumentType.TransactionMetric,
                rollupInterval: RollupInterval.OneMinute,
              },
            },
          });
        });

        it('returns data only for that environment', () => {
          const multipleEnvService = response.body.items.find(
            (item) => item.serviceName === 'multiple-env-service'
          );

          const totalRps = config.multiple.prod.rps;

          expect(multipleEnvService).to.eql({
            serviceName: 'multiple-env-service',
            transactionType: 'request',
            environments: ['production'],
            agentName: 'go',
            latency: 1000 * ((config.multiple.prod.duration * config.multiple.prod.rps) / totalRps),
            throughput: totalRps * 60,
            transactionErrorRate: 0,
          });
        });
      });

      describe('when applying a kuery filter', () => {
        before(async () => {
          response = await apmApiClient.readUser({
            endpoint: 'GET /internal/apm/services',
            params: {
              query: {
                start,
                end,
                environment: ENVIRONMENT_ALL.value,
                kuery: 'service.node.name:"multiple-env-service-development"',
                probability: 1,
                documentType: ApmDocumentType.TransactionMetric,
                rollupInterval: RollupInterval.OneMinute,
              },
            },
          });
        });

        it('returns data for that kuery filter only', () => {
          const multipleEnvService = response.body.items.find(
            (item) => item.serviceName === 'multiple-env-service'
          );

          const totalRps = config.multiple.dev.rps;

          expect(multipleEnvService).to.eql({
            serviceName: 'multiple-env-service',
            transactionType: 'request',
            environments: ['development'],
            agentName: 'go',
            latency: 1000 * ((config.multiple.dev.duration * config.multiple.dev.rps) / totalRps),
            throughput: totalRps * 60,
            transactionErrorRate: 1,
          });
        });
      });

      describe('when excluding default transaction types', () => {
        before(async () => {
          response = await apmApiClient.readUser({
            endpoint: 'GET /internal/apm/services',
            params: {
              query: {
                start,
                end,
                environment: ENVIRONMENT_ALL.value,
                kuery: 'not (transaction.type:request)',
                probability: 1,
                documentType: ApmDocumentType.TransactionMetric,
                rollupInterval: RollupInterval.OneMinute,
              },
            },
          });
        });

        it('returns data for the top transaction type that is not a default', () => {
          const multipleEnvService = response.body.items.find(
            (item) => item.serviceName === 'multiple-env-service'
          );

          expect(multipleEnvService?.transactionType).to.eql('rpc');
        });
      });

      describe('when using service transaction metrics', () => {
        before(async () => {
          response = await apmApiClient.readUser({
            endpoint: 'GET /internal/apm/services',
            params: {
              query: {
                start,
                end,
                environment: ENVIRONMENT_ALL.value,
                kuery: '',
                probability: 1,
                documentType: ApmDocumentType.ServiceTransactionMetric,
                rollupInterval: RollupInterval.OneMinute,
              },
            },
          });
        });

        it('returns services without transaction data', () => {
          const serviceNames = response.body.items.map((item) => item.serviceName);

          expect(serviceNames).to.contain('metric-only-service');

          expect(serviceNames).to.contain('error-only-service');
        });

        it('returns the correct statistics', () => {
          checkStats();
        });
      });

      describe('when using rolled up data', () => {
        before(async () => {
          response = await apmApiClient.readUser({
            endpoint: 'GET /internal/apm/services',
            params: {
              query: {
                start,
                end,
                environment: ENVIRONMENT_ALL.value,
                kuery: '',
                probability: 1,
                documentType: ApmDocumentType.TransactionMetric,
                rollupInterval: RollupInterval.TenMinutes,
              },
            },
          });
        });

        it('returns the correct statistics', () => {
          checkStats();
        });
      });
    }
  );

  registry.when(
    'APM Services Overview with a trial license when data is loaded',
    { config: 'trial', archives: [archiveName] },
    () => {
      describe('with the default APM read user', () => {
        describe('and fetching a list of services', () => {
          let response: {
            status: number;
            body: APIReturnType<'GET /internal/apm/services'>;
          };

          before(async () => {
            response = await apmApiClient.readUser({
              endpoint: `GET /internal/apm/services`,
              params: {
                query: {
                  start: archiveStart,
                  end: archiveEnd,
                  environment: ENVIRONMENT_ALL.value,
                  kuery: '',
                  probability: 1,
                  documentType: ApmDocumentType.TransactionMetric,
                  rollupInterval: RollupInterval.OneMinute,
                },
              },
            });
          });

          it('the response is successful', () => {
            expect(response.status).to.eql(200);
          });

          it('there is at least one service', () => {
            expect(response.body.items.length).to.be.greaterThan(0);
          });

          it('some items have a health status set', () => {
            // Under the assumption that the loaded archive has
            // at least one APM ML job, and the time range is longer
            // than 15m, at least an item should have a health status
            // set. Note that we currently have a bug where healthy
            // services report as unknown (so without any health status):
            // https://github.com/elastic/kibana/issues/77083

            const healthStatuses = sortBy(response.body.items, 'serviceName').map(
              (item: any) => item.healthStatus
            );

            expect(healthStatuses.filter(Boolean).length).to.be.greaterThan(0);

            expectSnapshot(healthStatuses).toMatchInline(`
              Array [
                undefined,
                "healthy",
                "healthy",
                "healthy",
                "healthy",
                "healthy",
                "healthy",
                "healthy",
              ]
            `);
          });
        });
      });

      describe('with a user that does not have access to ML', () => {
        let response: SupertestReturnType<'GET /internal/apm/services'>;
        before(async () => {
          response = await apmApiClient.noMlAccessUser({
            endpoint: 'GET /internal/apm/services',
            params: {
              query: {
                start: archiveStart,
                end: archiveEnd,
                environment: ENVIRONMENT_ALL.value,
                kuery: '',
                probability: 1,
                documentType: ApmDocumentType.TransactionMetric,
                rollupInterval: RollupInterval.OneMinute,
              },
            },
          });
        });

        it('the response is successful', () => {
          expect(response.status).to.eql(200);
        });

        it('there is at least one service', () => {
          expect(response.body.items.length).to.be.greaterThan(0);
        });

        it('contains no health statuses', () => {
          const definedHealthStatuses = response.body.items
            .map((item) => item.healthStatus)
            .filter(Boolean);

          expect(definedHealthStatuses.length).to.be(0);
        });
      });

      describe('and fetching a list of services with a filter', () => {
        let response: SupertestReturnType<'GET /internal/apm/services'>;
        before(async () => {
          response = await apmApiClient.noMlAccessUser({
            endpoint: 'GET /internal/apm/services',
            params: {
              query: {
                start: archiveStart,
                end: archiveEnd,
                environment: ENVIRONMENT_ALL.value,
                kuery: 'service.name:opbeans-java',
                probability: 1,
                documentType: ApmDocumentType.TransactionMetric,
                rollupInterval: RollupInterval.OneMinute,
              },
            },
          });
        });

        it('does not return health statuses for services that are not found in APM data', () => {
          expect(response.status).to.be(200);

          expect(response.body.items.length).to.be(1);

          expect(response.body.items[0].serviceName).to.be('opbeans-java');
        });
      });
    }
  );

  registry.when(
    'APM Service Overview with overflow bucket',
    { config: 'basic', archives: [] },
    () => {
      const range = timerange(new Date(start).getTime(), new Date(end).getTime());
      const interval = range.interval('1m');
      const TRANSACTION_TYPES = ['request'];
      const ENVIRONMENTS = ['production', 'development'];

      const OVERFLOW_BUCKET_NAME = '_other';

      const NUMBER_OF_SERVICES = 10;
      const NUMBER_OF_TRANSACTIONS = 10;

      const instances = lodashRange(0, NUMBER_OF_SERVICES)
        .map((groupId) => `service-${groupId}`)
        .flatMap((serviceName) => {
          const services = ENVIRONMENTS.map((env) =>
            apm.service({
              name: serviceName,
              environment: env,
              agentName: 'go',
            })
          );

          return lodashRange(0, 2).flatMap((serviceNodeId) =>
            services.map((service) => service.instance(`${serviceName}-${serviceNodeId}`))
          );
        });

      const transactionGroupRange = lodashRange(0, NUMBER_OF_TRANSACTIONS).map(
        (groupId) => `transaction-${groupId}`
      );

      before(async () => {
        return synthtrace.index(
          [
            interval.rate(1).generator((timestamp, timestampIndex) =>
              instances.flatMap((instance) =>
                transactionGroupRange.flatMap((groupId, groupIndex) => {
                  return instance
                    .transaction(groupId, TRANSACTION_TYPES[groupIndex % TRANSACTION_TYPES.length])
                    .timestamp(timestamp)
                    .duration(1000)
                    .success();
                })
              )
            ),
          ],
          {
            service_transactions: {
              max_groups: 2,
            },
          }
        );
      });

      after(() => {
        return synthtrace.clean();
      });

      describe('when overflow bucket is present', () => {
        let response: {
          status: number;
          body: APIReturnType<'GET /internal/apm/services'>;
        };

        before(async () => {
          response = await apmApiClient.readUser({
            endpoint: 'GET /internal/apm/services',
            params: {
              query: {
                start,
                end,
                environment: ENVIRONMENT_ALL.value,
                kuery: '',
                probability: 1,
                documentType: ApmDocumentType.ServiceTransactionMetric,
                rollupInterval: RollupInterval.OneMinute,
              },
            },
          });
        });

        it('returns a successful response', () => {
          expect(response.status).to.be(200);
        });

        it('should have service named _other', () => {
          const serviceNamesList = response.body.items.map((item) => item.serviceName);
          expect(serviceNamesList.includes(OVERFLOW_BUCKET_NAME)).to.be(true);
        });

        it('should have the correct value for serviceOverflowCount', function () {
          expect(response.body.serviceOverflowCount).to.be(320);
        });
      });
    }
  );
}
