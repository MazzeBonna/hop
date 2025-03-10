import { Chain } from 'src/constants'
import { Config, FileConfig, Watchers, getAllChains, getAllTokens, getEnabledTokens } from 'src/config'
import { URL } from 'url'
import { getAddress as checksumAddress } from 'ethers/lib/utils'

export function isValidToken (token: string) {
  const validTokens = getAllTokens()
  return validTokens.includes(token)
}

export function isValidChain (network: string) {
  const networks = getAllChains()
  return networks.includes(network)
}

export function validateKeys (validKeys: string[] = [], keys: string[]) {
  for (const key of keys) {
    if (!validKeys.includes(key)) {
      throw new Error(`unrecognized key "${key}". Valid keys are: ${validKeys.join(',')}`)
    }
  }
}

export async function validateConfigFileStructure (config?: FileConfig) {
  if (!config) {
    throw new Error('config is required')
  }

  if (!(config instanceof Object)) {
    throw new Error('config must be a JSON object')
  }

  const validSectionKeys = [
    'network',
    'chains',
    'sync',
    'tokens',
    'commitTransfers',
    'bondWithdrawals',
    'settleBondedWithdrawals',
    'watchers',
    'db',
    'logging',
    'keystore',
    'addresses',
    'metrics',
    'fees',
    'routes',
    'bonders',
    'signer',
    'vault',
    'blocklist'
  ]

  const validWatcherKeys = [
    Watchers.BondTransferRoot,
    Watchers.BondWithdrawal,
    Watchers.Challenge,
    Watchers.CommitTransfers,
    Watchers.SettleBondedWithdrawals,
    Watchers.ConfirmRoots,
    Watchers.L1ToL2Relay
  ]

  const validChainKeys = [
    Chain.Ethereum,
    Chain.Optimism,
    Chain.Arbitrum,
    Chain.Gnosis,
    Chain.Polygon,
    Chain.Nova,
    Chain.ZkSync,
    Chain.Linea,
    Chain.ScrollZk,
    Chain.Base
  ]

  // TODO: read from core
  const validTokenKeys = [
    'USDC',
    'USDT',
    'DAI',
    'ETH',
    'MATIC',
    'WBTC',
    'HOP',
    'SNX',
    'sUSD',
    'rETH',
    'UNI'
  ]

  const sectionKeys = Object.keys(config)
  validateKeys(validSectionKeys, sectionKeys)

  const enabledChains: string[] = Object.keys(config.chains)
  if (!enabledChains.includes(Chain.Ethereum)) {
    throw new Error(`config for chain "${Chain.Ethereum}" is required`)
  }

  validateKeys(validChainKeys, enabledChains)

  for (const key in config.chains) {
    const chain = config.chains[key]
    const validChainConfigKeys = ['rpcUrl', 'maxGasPrice']
    const chainKeys = Object.keys(chain)
    validateKeys(validChainConfigKeys, chainKeys)
  }

  const enabledTokens = Object.keys(config.tokens).filter(token => config.tokens[token])
  validateKeys(validTokenKeys, enabledTokens)

  const watcherKeys = Object.keys(config.watchers)
  validateKeys(validWatcherKeys, watcherKeys)

  if (config?.keystore && config?.signer) {
    throw new Error('You cannot have both a keystore and a signer')
  }

  if (config.db) {
    const validDbKeys = ['location']
    const dbKeys = Object.keys(config.db)
    validateKeys(validDbKeys, dbKeys)
  }

  if (config.logging) {
    const validLoggingKeys = ['level']
    const loggingKeys = Object.keys(config.logging)
    validateKeys(validLoggingKeys, loggingKeys)

    if (config?.logging?.level) {
      const validLoggingLevels = ['debug', 'info', 'warn', 'error']
      await validateKeys(validLoggingLevels, [config?.logging?.level])
    }
  }

  if (config.keystore) {
    const validKeystoreProps = [
      'location',
      'pass',
      'passwordFile',
      'parameterStore',
      'awsRegion'
    ]
    const keystoreProps = Object.keys(config.keystore)
    validateKeys(validKeystoreProps, keystoreProps)
  }

  if (config.signer) {
    const validSignerProps = [
      'type',
      'keyId',
      'awsRegion',
      'lambdaFunctionName'
    ]
    const signerProps = Object.keys(config.signer)
    validateKeys(validSignerProps, signerProps)
  }

  if (config.metrics) {
    const validMetricsKeys = ['enabled', 'port']
    const metricsKeys = Object.keys(config.metrics)
    validateKeys(validMetricsKeys, metricsKeys)
  }

  if (config.addresses) {
    const validAddressesProps = [
      'location'
    ]
    const addressesProps = Object.keys(config.addresses)
    validateKeys(validAddressesProps, addressesProps)
  }

  if (config.routes) {
    const sourceChains = Object.keys(config.routes)
    validateKeys(enabledChains, sourceChains)
    for (const sourceChain in config.routes) {
      const destinationChains = Object.keys(config.routes[sourceChain])
      validateKeys(enabledChains, destinationChains)
    }
  }

  if (config.fees) {
    const tokens = Object.keys(config.fees)
    validateKeys(enabledTokens, tokens)
    const destinationChains = new Set()
    for (const sourceChain in config.routes) {
      for (const destinationChain of Object.keys(config.routes[sourceChain])) {
        destinationChains.add(destinationChain)
      }
    }
    for (const token in config.fees) {
      const chains = Object.keys(config.fees[token])
      validateKeys(enabledChains, chains)
      for (const chain of destinationChains) {
        const found = (config.fees[token] as any)?.[chain as string]
        if (!found) {
          throw new Error(`missing fee for chain "${chain}" for token "${token}"`)
        }
      }
    }
    for (const enabledToken of enabledTokens) {
      const found = config?.fees?.[enabledToken]
      if (!found) {
        throw new Error(`missing fee for token "${enabledToken}"`)
      }
    }
  }

  if (config.commitTransfers) {
    const validCommitTransfersKeys = ['minThresholdAmount']
    const commitTransfersKeys = Object.keys(config.commitTransfers)
    validateKeys(validCommitTransfersKeys, commitTransfersKeys)
    const minThresholdAmount = config.commitTransfers.minThresholdAmount
    const tokens = Object.keys(minThresholdAmount)
    if (tokens.length) {
      validateKeys(enabledTokens, tokens)
      for (const token of enabledTokens) {
        if (!minThresholdAmount[token]) {
          throw new Error(`missing minThresholdAmount config for token "${token}"`)
        }
        const chains = Object.keys(minThresholdAmount[token])
        validateKeys(enabledChains, chains)
        for (const sourceChain in config.routes) {
          if (sourceChain === Chain.Ethereum) {
            continue
          }
          if (!minThresholdAmount[token][sourceChain]) {
            throw new Error(`missing minThresholdAmount config for token "${token}" source chain "${sourceChain}"`)
          }
          for (const destinationChain in config.routes[sourceChain]) {
            if (!minThresholdAmount[token][sourceChain][destinationChain]) {
              throw new Error(`missing minThresholdAmount config for token "${token}" source chain "${sourceChain}" destination chain "${destinationChain}"`)
            }
          }
        }
      }
    }
  }

  if (config.bonders) {
    const bonders = config.bonders as any
    if (!(bonders instanceof Object)) {
      throw new Error('bonders config should be an object')
    }
    const tokens = Object.keys(bonders)
    validateKeys(enabledTokens, tokens)
    for (const token of enabledTokens) {
      if (!(bonders[token] instanceof Object)) {
        throw new Error(`bonders config for "${token}" should be an object`)
      }
      const sourceChains = Object.keys(bonders[token])
      validateKeys(enabledChains, sourceChains)
      for (const sourceChain in bonders[token]) {
        if (!(bonders[token][sourceChain] instanceof Object)) {
          throw new Error(`bonders config for "${token}.${sourceChain}" should be an object`)
        }
        const destinationChains = Object.keys(bonders[token][sourceChain])
        validateKeys(enabledChains, destinationChains)
      }
    }
  }

  if (config.vault) {
    const vaultConfig = config.vault as any
    const vaultTokens = Object.keys(vaultConfig)
    validateKeys(validTokenKeys, vaultTokens)
    for (const tokenSymbol in vaultConfig) {
      const vaultChains = Object.keys(vaultConfig[tokenSymbol])
      validateKeys(validChainKeys, vaultChains)
      for (const chain in vaultConfig[tokenSymbol]) {
        const chainTokenConfig = vaultConfig[tokenSymbol][chain]
        const validConfigKeys = ['depositThresholdAmount', 'depositAmount', 'strategy', 'autoWithdraw', 'autoDeposit']
        const chainTokenConfigKeys = Object.keys(chainTokenConfig)
        validateKeys(validConfigKeys, chainTokenConfigKeys)
      }
    }
  }

  if (config.blocklist) {
    const blocklistConfig = config.blocklist as any
    if (!(blocklistConfig instanceof Object)) {
      throw new Error('blocklist config must be an object')
    }
    const validBlocklistKeys = ['path', 'addresses']
    const keys = Object.keys(blocklistConfig)
    validateKeys(validBlocklistKeys, keys)
  }
}

export async function validateConfigValues (config?: Config) {
  if (!config) {
    throw new Error('config is required')
  }

  if (!(config instanceof Object)) {
    throw new Error('config must be a JSON object')
  }

  for (const chainSlug in config.networks) {
    const chain = config.networks[chainSlug]
    if (!chain) {
      throw new Error(`RPC config for chain "${chain}" is required`)
    }
    const { rpcUrl, maxGasPrice, waitConfirmations } = chain
    if (!rpcUrl) {
      throw new Error(`RPC url for chain "${chainSlug}" is required`)
    }
    if (typeof rpcUrl !== 'string') {
      throw new Error(`RPC url for chain "${chainSlug}" must be a string`)
    }
    try {
      const parsed = new URL(rpcUrl)
      if (!parsed.protocol || !parsed.host || !['http:', 'https:'].includes(parsed.protocol)) {
        throw new URIError()
      }
    } catch (err) {
      throw new Error(`rpc url "${rpcUrl}" is invalid`)
    }
    if (waitConfirmations != null) {
      if (typeof waitConfirmations !== 'number') {
        throw new Error(`waitConfirmations for chain "${chainSlug}" must be a number`)
      }
      if (waitConfirmations <= 0) {
        throw new Error(`waitConfirmations for chain "${chainSlug}" must be greater than 0`)
      }
    }
    if (maxGasPrice != null) {
      if (typeof maxGasPrice !== 'number') {
        throw new Error(`maxGasPrice for chain "${chainSlug}" must be a number`)
      }
      if (maxGasPrice <= 0) {
        throw new Error(`maxGasPrice for chain "${chainSlug}" must be greater than 0`)
      }
    }
  }

  const enabledTokens = getEnabledTokens()

  if (config.commitTransfers) {
    const { minThresholdAmount } = config.commitTransfers
    if (Object.keys(minThresholdAmount).length) {
      for (const token of enabledTokens) {
        for (const sourceChain in config.routes) {
          if (sourceChain === Chain.Ethereum) {
            continue
          }
          for (const destinationChain in config.routes[sourceChain]) {
            if (typeof minThresholdAmount[token][sourceChain][destinationChain] !== 'number') {
              throw new Error(`minThresholdAmount config for token "${token}" source chain "${sourceChain}" destination chain "${destinationChain}" must be a number`)
            }
          }
        }
      }
    }
  }

  if (config.bonders) {
    const bonders = config.bonders as any
    for (const token of enabledTokens) {
      for (const sourceChain in bonders[token]) {
        for (const destinationChain in bonders[token][sourceChain]) {
          const bonderAddress = bonders[token][sourceChain][destinationChain]
          if (typeof bonderAddress !== 'string') {
            throw new Error('config bonder address should be a string')
          }
          try {
            checksumAddress(bonderAddress)
          } catch (err) {
            throw new Error(`config bonder address "${bonderAddress}" is invalid`)
          }
        }
      }
    }
  }

  if (config.vault) {
    const vaultConfig = config.vault as any
    for (const tokenSymbol in vaultConfig) {
      for (const chain in vaultConfig[tokenSymbol]) {
        const chainTokenConfig = vaultConfig[tokenSymbol][chain]
        if (typeof chainTokenConfig.autoDeposit !== 'boolean') {
          throw new Error('autoDeposit should be boolean')
        }
        if (chainTokenConfig.autoDeposit) {
          if (typeof chainTokenConfig.depositThresholdAmount !== 'number') {
            throw new Error('depositThresholdAmount should be a number')
          }
          if (typeof chainTokenConfig.depositAmount !== 'number') {
            throw new Error('depositAmount should be a number')
          }
        }
        if (typeof chainTokenConfig.autoWithdraw !== 'boolean') {
          throw new Error('autoWithdraw should be boolean')
        }

        const validStrategies = new Set(['yearn', 'aave'])
        if (!validStrategies.has(chainTokenConfig.strategy)) {
          throw new Error('strategy is invalid. Valid options are: yearn, aave')
        }
      }
    }
  }

  if (config.blocklist) {
    if (typeof config.blocklist.path !== 'string') {
      throw new Error('blocklist.path must be a string')
    }
  }
}
