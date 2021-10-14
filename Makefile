.DEFAULT_GOAL := help

SHELL := bash

VENV_NAME := apy-core
VENV_PATH := $(HOME)/.virtualenvs/$(VENV_NAME)
VENV_BIN := $(VENV_PATH)/bin


.PHONY: help
help:
	@echo ""
	@echo "slither             run static analysis of contracts"
	@echo "flatten             flatten contract for use in other tools"
	@echo "mnemonic            generate 12 word BIP-39 mnemonic"
	@echo "venv                create python virtual env"
	@echo "requirements        install/update venv requirements"
	@echo ""


.PHONY: slither
slither: venv
	$(VENV_BIN)/slither .

.PHONY: flatten
flatten: venv
	@if [ -z $$contract ]; then \
	    echo "Missing contract arg."; \
	    exit 1; \
	fi; \
	$(VENV_BIN)/slither-flat . --contract=$$contract

.PHONY: venv
venv: $(VENV_PATH)

$(VENV_PATH):
	python3 -m venv $(VENV_PATH)
	make requirements

.PHONY: requirements
requirements:
	$(VENV_BIN)/pip install -r requirements.txt

.PHONY: mnemonic
mnemonic:
	@$(VENV_BIN)/python -c "from mnemonic import Mnemonic; m = Mnemonic('english'); print(m.generate(strength=128))"
