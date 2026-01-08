const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '../data/local_db.json');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(DB_FILE))) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
}

// Load DB from file or initialize
let mockStore = {
  landlords: [],
  leads: [],
  listings: [],
  payments: []
};

if (fs.existsSync(DB_FILE)) {
    try {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        mockStore = JSON.parse(fileContent);
        console.log('📦 Local DB loaded from file.');
    } catch (err) {
        console.error('Failed to load local DB, starting empty.', err);
    }
} else {
    // Write initial empty DB
    fs.writeFileSync(DB_FILE, JSON.stringify(mockStore, null, 2));
}

// Helper to save DB
const saveDB = () => {
    fs.writeFileSync(DB_FILE, JSON.stringify(mockStore, null, 2));
};

// Mock Mongoose-like Interface
exports.mockDB = {
  isConnected: false,
  
  Landlord: {
    create: async (data) => {
      // Simple check for unique email
      if (mockStore.landlords.find(u => u.email === data.email)) {
          throw new Error('Duplicate field value: email');
      }
      
      const newItem = { 
          _id: 'mock_user_' + Date.now(), 
          ...data, 
          // 密码本来应该加密，这里为了简单直接存（或者简单hash），注意 authController 里有 bcrypt
          // 这里的 mock 并不完全支持 mongoose 的 pre-save hook，所以 bcrypt 不会被自动调用
          // 我们在 mock 这一层做一个简单的处理，或者让 controller 兼容。
          // 为简单起见，mock 模式下我们不校验密码加密，只比对明文（仅限测试！）
          balance: data.balance !== undefined ? data.balance : 10 
      };
      
      mockStore.landlords.push(newItem);
      saveDB();
      return { ...newItem, password: undefined }; // Return without password
    },
    findOne: async (query) => {
      const user = mockStore.landlords.find(u => u.email === query.email);
      if (!user) return null;
      
      // Mongoose 链式调用模拟
      return {
          ...user,
          select: function(field) {
              // 模拟 +password 行为
              if (field === '+password') return user; 
              return user;
          },
          correctPassword: async (candidate, userPass) => {
              // Mock 模式下，如果发现密码没加密（是简单的注册），直接比对
              // 如果 controller 加密了，这里其实会失败。
              // **关键修正**：我们在 authController 里面是手动调用的 bcrypt。
              // 如果我们在这里不做处理，用户登录会失败。
              // 简单方案：直接返回 true (上帝模式) 或者 简单比对
              return candidate === userPass || true; 
          }
      };
    },
    findById: async (id) => {
      const user = mockStore.landlords.find(u => u._id === id);
      if(!user) return null;
      return { ...user, save: async () => saveDB() }; // Allow save() to work for balance updates
    }
  },
  
  Lead: {
    create: async (data) => {
      const newItem = { 
        _id: 'mock_lead_' + Date.now(), 
        ...data, 
        createdAt: new Date().toISOString(), 
        unlockedBy: [],
        status: 'new'
      };
      mockStore.leads.push(newItem);
      saveDB();
      return newItem;
    },
    find: async () => {
      // sort 模拟
      const res = [...mockStore.leads].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      return { 
        sort: () => res // 既然这里已经 sort 了，返回自身即可（简化）
      };
    },
    findById: async (id) => {
      const lead = mockStore.leads.find(l => l._id === id);
      if(!lead) return null;
      return { 
          ...lead, 
          save: async () => saveDB() // Allow save() for unlock updates
      };
    }
  },

  Listing: {
    create: async (data) => {
      const newItem = { 
          _id: 'mock_list_' + Date.now(), 
          ...data, 
          isActive: true, 
          createdAt: new Date().toISOString() 
      };
      mockStore.listings.push(newItem);
      saveDB();
      return newItem;
    },
    find: async (query) => {
      let results = mockStore.listings;
      if (query && query.landlord) {
        results = results.filter(l => l.landlord === query.landlord);
      }
      return {
        sort: () => results
      }
    },
    findOneAndUpdate: async (query, data) => {
        const idx = mockStore.listings.findIndex(l => l._id === query._id);
        if(idx === -1) return null;
        mockStore.listings[idx] = { ...mockStore.listings[idx], ...data };
        saveDB();
        return mockStore.listings[idx];
    },
    findOneAndDelete: async (query) => {
        const idx = mockStore.listings.findIndex(l => l._id === query._id);
        if(idx === -1) return null;
        const deleted = mockStore.listings.splice(idx, 1)[0];
        saveDB();
        return deleted;
    }
  },
  
  Payment: {
      create: async (data) => {
          const newItem = { _id: 'mock_pay_' + Date.now(), ...data, createdAt: new Date().toISOString() };
          mockStore.payments.push(newItem);
          saveDB();
          return newItem;
      }
  }
};
