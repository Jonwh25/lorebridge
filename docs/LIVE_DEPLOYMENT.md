# Live deployment runbook

This runbook records the repository owner's current Azure/Foundry test
deployment. It is the source of truth for commands handed to the owner after a
change is implemented. It complements the portable workflow in
[`DEVELOPMENT_WORKFLOW.md`](DEVELOPMENT_WORKFLOW.md); it is not a requirement for
other LoreBridge installations.

## Live paths and processes

| Purpose | Value |
| --- | --- |
| Linux user | `azureuser` |
| LoreBridge checkout | `/data/lorebridge` |
| Foundry data directory | `/data/foundrydata` |
| Installed LoreBridge module | `/data/foundrydata/Data/modules/lorebridge` |
| Backend PM2 app name | `lorebridge-backend` |
| PM2 ecosystem config | `/home/azureuser/lorebridge-backend.config.cjs` |
| Backend entry point | `/data/lorebridge/packages/backend/dist/server.js` |
| Backend working directory | `/data/lorebridge` |
| Backend data directory | `/data/lorebridge-data` |
| Backend bind address | `127.0.0.1:3210` |

The PM2 ecosystem config is the source of truth for backend environment
variables. It contains secrets and must remain on the server. Never copy its
values into Git, an issue, a pull request, logs, or chat. Documentation may list
variable names, but must use placeholders for values.

The ecosystem config currently uses the Node interpreter selected through NVM.
Read the file before changing its interpreter path; do not assume a Node version
from an earlier conversation.

## Deploy a backend code change

After synchronizing the requested feature branch and running validation, build
the packages affected by the change. When the backend runtime or a shared package
consumed by it changed, restart the existing named process:

```sh
pm2 restart lorebridge-backend
pm2 logs lorebridge-backend --lines 20 --nostream
```

A code-only restart does not need `--update-env` because the ecosystem
environment did not change.

## Change backend environment variables

Edit the server-owned ecosystem config:

```sh
nano /home/azureuser/lorebridge-backend.config.cjs
```

Keep existing settings and secrets intact. Add or change only the variables
required by the feature. Then reload the application **from the ecosystem config
path**, rather than restarting only the saved process name:

```sh
pm2 startOrRestart /home/azureuser/lorebridge-backend.config.cjs --only lorebridge-backend --update-env
pm2 logs lorebridge-backend --lines 20 --nostream
```

`pm2 restart lorebridge-backend --update-env` can restart the process using its
already saved environment instead of rereading the edited ecosystem file. Do not
use `pm2 delete` as the normal way to refresh environment variables: deletion
changes the numeric PM2 id, creates unnecessary downtime, and can desynchronize
the saved process list.

## Verify configuration

Verify behavior through the relevant LoreBridge status endpoint whenever one is
available. This confirms what the running backend is actually using and avoids
depending on a mutable PM2 numeric id.

For the text provider:

```sh
curl -s -H "Authorization: Bearer <token>" \
  https://<your-host>/lorebridge-api/v1/provider/status | jq
```

For the image provider:

```sh
curl -s http://127.0.0.1:3210/v1/image-provider/status | jq
```

If an authenticated route or deployment proxy changes an endpoint, inspect the
current backend route and use the deployed equivalent. Never print API keys while
verifying the environment. If direct PM2 environment inspection is unavoidable,
resolve the current application id by name first; never assume it is `1`, `2`, or
any other fixed number.

## Persist the PM2 process list

Run `pm2 save` after intentionally changing process topology, such as adding,
removing, or renaming an application, and after verifying the desired list is
healthy. A normal code restart or ecosystem environment reload does not require a
new save when the process names and startup definitions are unchanged.

Before saving, check the list so an accidental deletion is not persisted:

```sh
pm2 status
pm2 save
```

## Foundry module deployment

Foundry module artifacts are deployed under
`/data/foundrydata/Data/modules/lorebridge`. Build and copy only the artifacts and
templates required by the change, following the tailored command rules in
[`../AGENTS.md`](../AGENTS.md). Hard-refresh Foundry after copying browser assets.

## Agent handoff requirement

When giving the repository owner live-test instructions:

1. Read this runbook before choosing PM2 commands.
2. Include only commands relevant to the actual changed files and configuration.
3. Distinguish a code-only restart from an ecosystem environment reload.
4. Use the PM2 app name for ordinary operations and the ecosystem config path when
   environment variables changed.
5. Verify through logs and the relevant application status endpoint.
6. Never expose or request existing secret values in the handoff.
