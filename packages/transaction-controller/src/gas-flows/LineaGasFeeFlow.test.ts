import { query } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import type { GasFeeState } from '@metamask/gas-fee-controller';

import { CHAIN_IDS } from '../constants';
import type {
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  TransactionMeta,
} from '../types';
import { TransactionStatus } from '../types';
import { DefaultGasFeeFlow } from './DefaultGasFeeFlow';
import { LineaGasFeeFlow } from './LineaGasFeeFlow';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  query: jest.fn(),
}));

const TRANSACTION_META_MOCK: TransactionMeta = {
  id: '1',
  chainId: '0x123',
  status: TransactionStatus.unapproved,
  time: 0,
  txParams: {
    from: '0x123',
  },
};

const LINEA_RESPONSE_MOCK = {
  baseFeePerGas: '0x111111111',
  priorityFeePerGas: '0x222222222',
};

const RESPONSE_MOCK: GasFeeFlowResponse = {
  estimates: {
    low: {
      maxFeePerGas: '0x1',
      maxPriorityFeePerGas: '0x2',
    },
    medium: {
      maxFeePerGas: '0x3',
      maxPriorityFeePerGas: '0x4',
    },
    high: {
      maxFeePerGas: '0x5',
      maxPriorityFeePerGas: '0x6',
    },
  },
};

describe('LineaGasFeeFlow', () => {
  const queryMock = jest.mocked(query);

  let request: GasFeeFlowRequest;
  let getGasFeeControllerEstimatesMock: jest.MockedFn<
    () => Promise<GasFeeState>
  >;

  beforeEach(() => {
    jest.resetAllMocks();

    request = {
      ethQuery: {} as EthQuery,
      getGasFeeControllerEstimates: getGasFeeControllerEstimatesMock,
      transactionMeta: TRANSACTION_META_MOCK,
    };

    queryMock.mockResolvedValue(LINEA_RESPONSE_MOCK);
  });

  describe('matchesTransaction', () => {
    it.each([
      ['linea mainnet', CHAIN_IDS.LINEA_MAINNET],
      ['linea testnet', CHAIN_IDS.LINEA_GOERLI],
    ])('returns true if chain ID is %s', (_title, chainId) => {
      const flow = new LineaGasFeeFlow();

      const transaction = {
        ...TRANSACTION_META_MOCK,
        chainId,
      };

      expect(flow.matchesTransaction(transaction)).toBe(true);
    });
  });

  describe('getGasFees', () => {
    it('returns priority fees using custom RPC method and static priority fee multipliers', async () => {
      const flow = new LineaGasFeeFlow();
      const response = await flow.getGasFees(request);

      expect(
        Object.values(response.estimates).map(
          (level) => level.maxPriorityFeePerGas,
        ),
      ).toStrictEqual([
        LINEA_RESPONSE_MOCK.priorityFeePerGas,
        '0x23a3d70a3',
        '0x25658bf25',
      ]);
    });

    it('returns max fees using custom RPC method and static base fee multipliers', async () => {
      const flow = new LineaGasFeeFlow();
      const response = await flow.getGasFees(request);

      expect(
        Object.values(response.estimates).map((level) => level.maxFeePerGas),
      ).toStrictEqual(['0x333333333', '0x3a7ae1479', '0x42428f5c1']);
    });

    it('uses default flow if error', async () => {
      jest
        .spyOn(DefaultGasFeeFlow.prototype, 'getGasFees')
        .mockResolvedValue(RESPONSE_MOCK);

      const defaultGasFeeFlowGetGasFeesMock = jest.mocked(
        DefaultGasFeeFlow.prototype.getGasFees,
      );

      queryMock.mockRejectedValue(new Error('TestError'));

      const flow = new LineaGasFeeFlow();
      const response = await flow.getGasFees(request);

      expect(response).toStrictEqual(RESPONSE_MOCK);

      expect(defaultGasFeeFlowGetGasFeesMock).toHaveBeenCalledTimes(1);
      expect(defaultGasFeeFlowGetGasFeesMock).toHaveBeenCalledWith(request);
    });

    it('throws if default flow fallback fails', async () => {
      jest
        .spyOn(DefaultGasFeeFlow.prototype, 'getGasFees')
        .mockRejectedValue(new Error('TestError'));

      const defaultGasFeeFlowGetGasFeesMock = jest.mocked(
        DefaultGasFeeFlow.prototype.getGasFees,
      );

      queryMock.mockRejectedValue(new Error('error'));

      const flow = new LineaGasFeeFlow();
      const response = flow.getGasFees(request);

      await expect(response).rejects.toThrow('TestError');

      expect(defaultGasFeeFlowGetGasFeesMock).toHaveBeenCalledTimes(1);
      expect(defaultGasFeeFlowGetGasFeesMock).toHaveBeenCalledWith(request);
    });
  });
});