const Lead = require('../models/Lead');
const Landlord = require('../models/Landlord');
const Payment = require('../models/Payment');

const UNLOCK_COST = 1; // 1 Euro (demo pricing)

exports.createLead = async (req, res, next) => {
  try {
    // 公开接口：租客提交线索
    const newLead = await Lead.create({
      requirement: req.body.requirement,
      budget: req.body.budget,
      moveInDate: req.body.moveInDate,
      wechatId: req.body.wechatId, // 租客微信
      phone: req.body.phone,
      email: req.body.email,
      reviewStatus: 'pending'
    });

    res.status(201).json({
      status: 'success',
      data: {
        lead: newLead
      }
    });
  } catch (err) {
    res.status(400).json({
      status: 'fail',
      message: err.message
    });
  }
};

exports.getAllLeads = async (req, res, next) => {
  try {
    // 房东查看所有线索列表（加密状态）
    const leads = await Lead.find().sort('-createdAt');
    
    // 如果当前房东已经解锁了该线索，则显示完整信息；否则隐藏联系方式
    const sanitizedLeads = leads.map(lead => {
      const isUnlocked = lead.unlockedBy.includes(req.user.id);
      
      const leadObj = lead.toObject();
      if (!isUnlocked) {
        leadObj.wechatId = '***付费查看***';
        leadObj.phone = leadObj.phone ? '***付费查看***' : undefined;
        leadObj.email = leadObj.email ? '***付费查看***' : undefined;
      }
      return {
        ...leadObj,
        isUnlocked // 前端根据这个字段显示“解锁”按钮
      };
    });

    res.status(200).json({
      status: 'success',
      results: leads.length,
      data: {
        leads: sanitizedLeads
      }
    });
  } catch (err) {
    res.status(400).json({
      status: 'fail',
      message: err.message
    });
  }
};

exports.unlockLead = async (req, res, next) => {
  try {
    const leadId = req.params.id;
    const landlord = req.user; // From auth middleware

    // 1. Check if lead exists
    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({ status: 'fail', message: 'No lead found with that ID' });
    }

    // Require admin review before landlords pay to unlock
    if (lead.reviewStatus !== 'approved') {
      return res.status(403).json({ status: 'fail', message: 'Lead pending review, cannot unlock yet.' });
    }

    // 2. Check if already unlocked
    if (lead.unlockedBy.includes(landlord.id)) {
      return res.status(400).json({ status: 'fail', message: 'You have already unlocked this lead' });
    }

    // 3. Check balance
    if (landlord.balance < UNLOCK_COST) {
      return res.status(402).json({ 
        status: 'fail', 
        message: 'Insufficient balance. Please top up.',
        code: 'INSUFFICIENT_BALANCE'
      });
    }

    // 4. Transaction (Using Session if Replica Set, but simple logic for now)
    // Deduct Balance
    landlord.balance -= UNLOCK_COST;
    await landlord.save({ validateBeforeSave: false });

    // Update Lead
    lead.unlockedBy.push(landlord.id);
    await lead.save();

    // Record Payment History
    await Payment.create({
      landlord: landlord.id,
      amount: -UNLOCK_COST,
      currency: 'EUR',
      type: 'unlock_lead',
      status: 'completed',
      targetId: lead.id
    });

    res.status(200).json({
      status: 'success',
      data: {
        lead, // Now returns full lead including contact info
        balance: landlord.balance
      }
    });

  } catch (err) {
    res.status(400).json({
      status: 'fail',
      message: err.message
    });
  }
};


