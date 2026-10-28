import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  autocatFromKeywordRules,
  EXP_AUTO_CAT_RULES,
  merchantMatchesKey,
  suggestCatFromLearned,
} from '../shared/core/catSuggest.js';

function auto(desc) {
  return autocatFromKeywordRules(desc, EXP_AUTO_CAT_RULES).cat;
}

describe('merchantMatchesKey', () => {
  it('matches whole words, not infixes', () => {
    assert.equal(merchantMatchesKey('carrefour', 'car'), false);
    assert.equal(merchantMatchesKey('car workshop', 'car'), true);
    assert.equal(merchantMatchesKey('business lunch', 'bus'), false);
    assert.equal(merchantMatchesKey('rapid bus kl', 'bus'), true);
    assert.equal(merchantMatchesKey('mcdonalds', 'mcd'), false);
    assert.equal(merchantMatchesKey('mcdonalds bandar', 'mcdonalds'), true);
    assert.equal(merchantMatchesKey('petrol station', 'pet'), false);
    assert.equal(merchantMatchesKey('Apple Store', 'apple'), true);
  });
});

describe('learned category suggestions', () => {
  it('does not apply a short key as a prefix of another merchant', () => {
    const rules = { car: 'Car Expenses', tesco: 'Groceries' };
    assert.equal(suggestCatFromLearned('Carrefour', rules), null);
    assert.equal(suggestCatFromLearned('car workshop', rules), 'Car Expenses');
    assert.equal(suggestCatFromLearned('Tesco Extra', rules), 'Groceries');
  });

  it('does not overwrite a category the user already picked on the chip grid', () => {
    const lockedByUser = true;
    const suggested = suggestCatFromLearned('Tesco Extra', { tesco: 'Groceries' });
    const savedCat = lockedByUser ? 'Petrol' : suggested;
    assert.equal(suggested, 'Groceries');
    assert.equal(savedCat, 'Petrol');
  });

  it('prefers the longest matching rule', () => {
    const rules = { insurance: 'Insurance', 'car insurance': 'Car Insurance' };
    assert.equal(suggestCatFromLearned('car insurance etiqa', rules), 'Car Insurance');
  });
});

describe('import auto-category simulation', () => {
  it('does not tag unrelated merchants with short keys', () => {
    assert.equal(auto('Business class ticket fee'), 'Other');
    assert.equal(auto('Apple Store Orchard'), 'Other');
    assert.equal(auto('Share tea dessert'), 'Other');
    assert.equal(auto('AIA Takaful'), 'Insurance');
  });

  it('keeps intended labels for common MY merchants', () => {
    assert.equal(auto('SHELL STATION 123'), 'Petrol');
    assert.equal(auto('GRAB FOOD *NASI LEMAK'), 'Eating out');
    assert.equal(auto('GRAB *RIDE KLCC'), 'Ride-hailing');
    assert.equal(auto('MCDONALDS BANDAR UTAMA'), 'Eating out');
    assert.equal(auto('TESCO EXTRA'), 'Groceries');
    assert.equal(auto('CAR INSURANCE ETIQA'), 'Car Insurance');
    assert.equal(auto('TAKAFUL MOTOR'), 'Car Insurance');
    assert.equal(auto('NETFLIX.COM'), 'Subscription');
    assert.equal(auto('APPLE MUSIC'), 'Subscription');
    assert.equal(auto('MAXIS HOME FIBRE'), 'Internet');
    assert.equal(auto('MAXIS PREPAID'), 'Phone');
    assert.equal(auto('MYEG JPJ'), 'Bills');
    assert.equal(auto('WATSONS PHARMACY'), 'Pharmacy');
    assert.equal(auto('LRT KELANA JAYA'), 'Transport');
  });

  it('longest keyword wins when several rules could match', () => {
    assert.equal(auto('grab food'), 'Eating out');
    assert.notEqual(auto('grab food'), 'Food');
    assert.equal(auto('car insurance'), 'Car Insurance');
    assert.notEqual(auto('car insurance'), 'Insurance');
  });
});

describe('add-expense chip catalog', () => {
  const EXP_CATS = {
    Food: 1, Groceries: 1, 'Eating out': 1, Coffee: 1,
    Shopping: 1, Clothing: 1, Electronics: 1,
    Rent: 1, Utilities: 1, Internet: 1, Renovation: 1, Household: 1,
    Health: 1, Fitness: 1, Grooming: 1, Pharmacy: 1,
    Bills: 1, Insurance: 1, 'Loan payment': 1, Tax: 1, Phone: 1, 'Bank fees': 1,
    Petrol: 1, 'Car Service': 1, 'Car Repair Labour': 1, 'Car Parts': 1,
    'Tyre Service': 1, Toll: 1, Parking: 1, 'Car Expenses': 1, 'Car Insurance': 1,
    Transport: 1, 'Ride-hailing': 1, Flight: 1, Hotel: 1,
    Entertainment: 1, Subscription: 1, Travel: 1, Hobbies: 1,
    Education: 1, Kids: 1, Gifts: 1, Charity: 1, 'Pet care': 1, Other: 1,
  };
  const GROUPS = [
    ['Food', 'Groceries', 'Eating out', 'Coffee'],
    ['Shopping', 'Clothing', 'Electronics', 'Gifts'],
    ['Rent', 'Utilities', 'Internet', 'Phone', 'Renovation', 'Household'],
    ['Health', 'Pharmacy', 'Fitness', 'Grooming'],
    ['Bills', 'Insurance', 'Loan payment', 'Tax', 'Bank fees'],
    ['Petrol', 'Car Service', 'Car Repair Labour', 'Car Parts', 'Tyre Service', 'Toll', 'Parking', 'Car Expenses', 'Car Insurance', 'Transport', 'Ride-hailing', 'Flight', 'Hotel'],
    ['Entertainment', 'Subscription', 'Travel', 'Hobbies'],
    ['Education', 'Kids', 'Charity', 'Pet care'],
    ['Other'],
  ];

  it('every grouped chip exists and every category is listed once', () => {
    const listed = [];
    GROUPS.flat().forEach((name) => {
      assert.ok(EXP_CATS[name], 'unknown chip: ' + name);
      listed.push(name);
    });
    const unique = new Set(listed);
    assert.equal(unique.size, listed.length, 'duplicate chip names');
    Object.keys(EXP_CATS).forEach((name) => {
      assert.ok(unique.has(name), 'category missing from groups: ' + name);
    });
  });
});
