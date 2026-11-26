// Storage layer. Uses Azure Cosmos DB + Blob Storage when COSMOS_CONNECTION / STORAGE_CONNECTION are set,
// otherwise a local JSON file + folder (for `npm run dev` without Azure).
const path = require("path");
const fs = require("fs");

const useAzure = !!(process.env.COSMOS_CONNECTION && process.env.STORAGE_CONNECTION);

/* ---------------- Azure ---------------- */
function azureStore() {
  const { CosmosClient } = require("@azure/cosmos");
  const { BlobServiceClient } = require("@azure/storage-blob");
  const cosmos = new CosmosClient(process.env.COSMOS_CONNECTION);
  const dbName = process.env.COSMOS_DATABASE || "hackathon2";
  const blobs = BlobServiceClient.fromConnectionString(process.env.STORAGE_CONNECTION);
  const files = blobs.getContainerClient(process.env.ABSTRACT_CONTAINER || "abstracts");

  let ready;
  const init = () => ready ??= (async () => {
    const { database } = await cosmos.databases.createIfNotExists({ id: dbName });
    const { container } = await database.containers.createIfNotExists({ id: "teams", partitionKey: { paths: ["/id"] } });
    await files.createIfNotExists();   // private container: abstracts are only served through the admin API
    return container;
  })();

  return {
    async findDuplicate(teamNameKey, leaderEmail) {
      const c = await init();
      const { resources } = await c.items.query({
        query: "SELECT TOP 1 c.teamNameKey, c.leaderEmail FROM c WHERE c.type = 'team' AND (c.teamNameKey = @n OR c.leaderEmail = @e)",
        parameters: [{ name: "@n", value: teamNameKey }, { name: "@e", value: leaderEmail }],
      }).fetchAll();
      return resources[0] || null;
    },
    async createTeam(doc) { const c = await init(); await c.items.create(doc); return doc; },
    async listTeams() {
      const c = await init();
      const { resources } = await c.items.query("SELECT * FROM c WHERE c.type = 'team' ORDER BY c.createdAt DESC").fetchAll();
      return resources;
    },
    async getTeam(id) {
      const c = await init();
      try { const { resource } = await c.item(id, id).read(); return resource?.type === "team" ? resource : null; }
      catch (e) { if (e.code === 404) return null; throw e; }
    },
    async updateTeam(doc) { const c = await init(); await c.item(doc.id, doc.id).replace(doc); return doc; },
    // Atomic counter for HACK2-### IDs (optimistic concurrency with ETags).
    async nextTeamNumber() {
      const c = await init();
      for (let attempt = 0; attempt < 20; attempt++) {
        let counter;
        try { ({ resource: counter } = await c.item("counter", "counter").read()); }
        catch (e) { if (e.code !== 404) throw e; }
        if (!counter) {
          try { await c.items.create({ id: "counter", type: "counter", next: 2 }); return 1; }
          catch (e) { if (e.code === 409) continue; throw e; }
        }
        const n = counter.next;
        try {
          await c.item("counter", "counter").replace({ ...counter, next: n + 1 }, { accessCondition: { type: "IfMatch", condition: counter._etag } });
          return n;
        } catch (e) { if (e.code === 412) continue; throw e; }
      }
      throw new Error("Could not allocate a team number, please retry.");
    },
    async saveFile(name, buffer) {
      await init();
      await files.getBlockBlobClient(name).uploadData(buffer, { blobHTTPHeaders: { blobContentType: "application/pdf" } });
    },
    async readFile(name) { await init(); return files.getBlobClient(name).downloadToBuffer(); },
  };
}

/* ---------------- Local (dev only) ---------------- */
function localStore() {
  const dir = process.env.LOCAL_DATA_DIR || path.join(__dirname, "..", "..", ".localdata");
  const dbFile = path.join(dir, "db.json");
  const fileDir = path.join(dir, "abstracts");
  fs.mkdirSync(fileDir, { recursive: true });
  const load = () => { try { return JSON.parse(fs.readFileSync(dbFile, "utf8")); } catch { return { teams: [], next: 1 }; } };
  const save = db => fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
  return {
    async findDuplicate(teamNameKey, leaderEmail) {
      return load().teams.find(t => t.teamNameKey === teamNameKey || t.leaderEmail === leaderEmail) || null;
    },
    async createTeam(doc) { const db = load(); db.teams.push(doc); save(db); return doc; },
    async listTeams() { return load().teams.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
    async getTeam(id) { return load().teams.find(t => t.id === id) || null; },
    async updateTeam(doc) { const db = load(); db.teams = db.teams.map(t => t.id === doc.id ? doc : t); save(db); return doc; },
    async nextTeamNumber() { const db = load(); const n = db.next || 1; db.next = n + 1; save(db); return n; },
    async saveFile(name, buffer) { fs.writeFileSync(path.join(fileDir, name), buffer); },
    async readFile(name) { return fs.readFileSync(path.join(fileDir, name)); },
  };
}

module.exports = useAzure ? azureStore() : localStore();
module.exports.mode = useAzure ? "azure" : "local";
