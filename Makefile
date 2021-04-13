.DEFAULT_GOAL := help

SHELL := bash

DOCKERHOST := $(shell ifconfig | grep -E "([0-9]{1,3}\.){3}[0-9]{1,3}" | grep -v 127.0.0.1 | awk '{ print $$2 }' | cut -f2 -d: | head -n1)

# original name of repo is external-adapter-js
CHAINLINK_REPO_FOLDER := "./chainlink-tvl-adapter"
CHAINLINK_REPO_URL := "git@github.com:smartcontractkit/external-adapters-js.git"
# Use our own repo for testing/audit until Chainlink updates their adaptor code
# for the new IAssetAllocation changes.  If using this, should do a
# `git checkout apy-finance-audit-testing` also.
# CHAINLINK_REPO_URL := "git@github.com:apy-finance/external-adapters-js.git"

AM_SCRIPTS_FOLDER := scripts/asset_management

.PHONY: help
help:
	@echo ""
	@echo "OPERATE:"
	@echo "build                    Build images"
	@echo "up                       Create and start all containers"
	@echo "down                     Remove all containers and volumes"
	@echo "restart                  Remove, re-create, and start containers"
	@echo "rebuild                  Remove, build, then start containers"
	@echo ""
	@echo "DEBUGGING:"
	@echo "logs                     Re-attach to running container logs"
	@echo "log                      Re-attach to specified running container log"
	@echo "ps                       List running container info"
	@echo "bash                     Bash inside a container (default=node)"
	@echo ""
	@echo "MAINTENANCE:"
	@echo "clean                    Remove dangling images and exited containers"
	@echo "clear_logs               Truncate Docker logs"
	@echo ""

.PHONY: build
build:
	docker-compose build
	@echo "All built 🏛"

.PHONY: up
up:
	@make up_detached
	@make logs

.PHONY: up_detached
up_detached:
	DOCKERHOST=$(DOCKERHOST) docker-compose up -d
	@make create_job

.PHONY: down
down:
	docker-compose down --volumes

.PHONY: restart
restart:
	@echo "make down ==> make up"
	@make down
	@make up

.PHONY: rebuild
rebuild:
	@echo "make down ==> make build ==> make up"
	@make down
	@make build
	@make up

.PHONY: logs
logs:
	docker-compose logs -f 

.PHONY: log
log:
	@if test -z $(name); then\
	    echo "";\
	    echo "Please enter a container name as argument.";\
	    echo "";\
	    echo " e.g. 'make log name=node'";\
	    echo "";\
	    echo "or use 'make logs' to attach to all container logs.";\
	    echo "";\
	    echo "Available container names are:";\
	    echo "  node";\
	    echo "  db";\
	    echo "  adapter";\
	else\
	  docker-compose logs -f $(name);\
	fi

.PHONY: bash
bash:
	@if test -z $(name); then\
	    echo "bash in node container:";\
	    docker-compose exec node bash;\
	else\
	    echo "bash in $(name) container:";\
	    docker-compose exec $(name) bash;\
	fi

.PHONY: clean
clean:
	@echo "Deleting exited containers..."
	docker ps -a -q -f status=exited | xargs docker rm -v
	@echo "Deleting dangling images..."
	docker images -q -f dangling=true | xargs docker rmi
	@echo "All clean 🛀"

# https://stackoverflow.com/a/51866793/1175053
.PHONY: clear_logs
clear_logs:
	docker run -it --rm --privileged --pid=host alpine:latest nsenter -t 1 -m -u -n -i -- sh -c 'truncate -s0 /var/lib/docker/containers/*/*-json.log'

.PHONY: ps
ps:
	docker-compose ps

.PHONY: create_job
create_job:
	@docker-compose exec node bash -c "\
		while !</dev/tcp/node/6688; do sleep 5; done; \
		chainlink admin login -f /docker/api && \
		if !(chainlink jobs list | grep -q fluxmonitor); then \
			chainlink bridges create /docker/bridge.json; \
			chainlink jobs create /docker/tvlAgg-spec.json; \
		fi \
	"

.PHONY: clone_chainlink_repo
clone_chainlink_repo:
	@if [ ! -d "$(CHAINLINK_REPO_FOLDER)" ]; then \
	  git clone "$(CHAINLINK_REPO_URL)" "$(CHAINLINK_REPO_FOLDER)"; \
	else \
          cd "$(CHAINLINK_REPO_FOLDER)"; \
          git pull; \
          cd -;\
	fi

.PHONY: delete_chainlink_repo
delete_chainlink_repo:
	rm -rf "$(CHAINLINK_REPO_FOLDER)"

.PHONY: test_chainlink
test_chainlink:
	yarn fork:mainnet > /dev/null &
	make clone_chainlink_repo
	while !</dev/tcp/localhost/8545; do sleep 5; done
	make up_detached
	##################
	# run tests here
	##################
	make down
	(ps -ef | grep 'fork_mainnet' | grep -v grep | awk '{print $2}' | xargs kill -9) || true


.PHONY: CI_tests
CI_tests:
	yarn test:unit
	yarn test:integration
	make test_chainlink

# have to use ganache since `eth_subscribe` is buggy in hardhat
# and is required for Chainlink usage
.PHONY: fork_mainnet
fork_mainnet:
	@MNEMONIC='' yarn fork:mainnet

.PHONY: audit_testing
audit_testing:
	@if test -z $(step); then\
	  echo "'step' argument is required, e.g. make audit_testing step=deploy" ;\
	  exit 1 ;\
    fi ;\
	HARDHAT_NETWORK=localhost node scripts/audit_testing/"${step}".js


.PHONY: check_all
check_all:
	make check_pools_reserves
	make check_tvl
	make check_account_balances

.PHONY: check_pools_reserves
check_pools_reserves:
	HARDHAT_NETWORK=localhost node $(AM_SCRIPTS_FOLDER)/check_pools_reserves.js

.PHONY: check_tvl
check_tvl:
	HARDHAT_NETWORK=localhost node $(AM_SCRIPTS_FOLDER)/check_tvl.js

.PHONY: check_account_balances
check_account_balances:
	HARDHAT_NETWORK=localhost node $(AM_SCRIPTS_FOLDER)/check_account_balances.js

.PHONY: deploy
deploy:
	HARDHAT_NETWORK=localhost node $(AM_SCRIPTS_FOLDER)/deploy.js

.PHONY: fund
fund:
	./$(AM_SCRIPTS_FOLDER)/fund-account.sh

.PHONY: topup
topup:
	./$(AM_SCRIPTS_FOLDER)/topup-pools.sh

.PHONY: swap_stable
swap_stable:
	HARDHAT_NETWORK=localhost node $(AM_SCRIPTS_FOLDER)/swap_3pool.js -i $(in) -o $(out) -a $(amount)

.PHONY: register
register:
	@for script in $(AM_SCRIPTS_FOLDER)/register_*.js; do \
		HARDHAT_NETWORK=localhost node $${script} ;\
	done

.PHONY: withdraw
withdraw:
	HARDHAT_NETWORK=localhost node $(AM_SCRIPTS_FOLDER)/wi†hdraw.js

.PHONY: user_deposit
user_deposit:
	HARDHAT_NETWORK=localhost node $(AM_SCRIPTS_FOLDER)/user_deposit.js

.PHONY: user_funding
user_funding:
	HARDHAT_NETWORK=localhost node $(AM_SCRIPTS_FOLDER)/user_funding.js

.PHONY: user_withdraw
user_withdraw:
	HARDHAT_NETWORK=localhost node $(AM_SCRIPTS_FOLDER)/user_wi†hdraw.js
