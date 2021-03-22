# Auditor Testing Framework

## Requirements

- Docker: [Mac](https://www.docker.com/docker-mac) | [Ubuntu](https://www.docker.com/docker-ubuntu)\
  Note that Docker Desktop for Mac will include Docker Compose but a Linux user will need to install Docker Compose separately.
- GNU Make (this is installed by default on Mac)
- git
- node
- yarn

## Quickstart

- install javascript dependencies:  
  `yarn`
- run forked Mainnet:  
  `make forked_mainnet`
- start chainlink node (in another terminal):  
  `make up`  
  (the first time, this will build the container, ~ 5 minutes when I time it)
- deploy the upgraded APY.Finance system locally:  
  `make audit_testing step=deploy`

At this point, everything should be good-to-go but here are a few key things you may want to do:

- fund the deployed strategy account with stablecoins:  
  `make audit_testing step=fund`
- register expected asset allocations from Curve 3pool strategy:  
  `make audit_testing step=register_curve`
- execute Curve 3pool strategy:  
  `make audit_testing step=execute_curve`
- check deployed TVL:  
  `make audit_testing step=check_tvl`

The scripts being run are located in `scripts/audit_testing` (same location as this README).

## Asset allocation registration

## Generic execution
