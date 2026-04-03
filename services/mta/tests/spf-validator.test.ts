import { describe, it, expect } from 'bun:test';
import { parseSpfRecord } from '../src/spf/validator.js';

describe('SPF Validator — parseSpfRecord', () => {
  it('should parse a simple SPF record with ip4 and all', () => {
    const result = parseSpfRecord('v=spf1 ip4:192.168.1.0/24 -all');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.version).toBe('spf1');
    expect(result.value.mechanisms).toHaveLength(2);
    expect(result.value.mechanisms[0]).toEqual({
      qualifier: '+',
      type: 'ip4',
      value: '192.168.1.0/24',
    });
    expect(result.value.mechanisms[1]).toEqual({
      qualifier: '-',
      type: 'all',
      value: '',
    });
  });

  it('should reject a record without v=spf1 tag', () => {
    const result = parseSpfRecord('v=spf2 ip4:10.0.0.0/8 -all');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('missing v=spf1');
  });

  it('should parse multiple mechanisms including include and mx', () => {
    const result = parseSpfRecord(
      'v=spf1 ip4:10.0.0.0/8 include:_spf.google.com mx a -all',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const types = result.value.mechanisms.map((m) => m.type);
    expect(types).toEqual(['ip4', 'include', 'mx', 'a', 'all']);

    const includeMech = result.value.mechanisms[1]!;
    expect(includeMech.value).toBe('_spf.google.com');
    expect(includeMech.qualifier).toBe('+');
  });

  it('should parse ip6 mechanisms', () => {
    const result = parseSpfRecord('v=spf1 ip6:2001:db8::/32 -all');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.mechanisms[0]!.type).toBe('ip6');
    expect(result.value.mechanisms[0]!.value).toBe('2001:db8::/32');
  });

  it('should handle qualifier mapping: + pass, - fail, ~ softfail, ? neutral', () => {
    const result = parseSpfRecord('v=spf1 +ip4:1.2.3.4 -ip4:5.6.7.8 ~ip4:9.10.11.12 ?all');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.mechanisms[0]!.qualifier).toBe('+');
    expect(result.value.mechanisms[1]!.qualifier).toBe('-');
    expect(result.value.mechanisms[2]!.qualifier).toBe('~');
    expect(result.value.mechanisms[3]!.qualifier).toBe('?');
  });

  it('should default qualifier to + when none is specified', () => {
    const result = parseSpfRecord('v=spf1 ip4:10.0.0.1 all');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.mechanisms[0]!.qualifier).toBe('+');
    expect(result.value.mechanisms[1]!.qualifier).toBe('+');
  });

  it('should parse redirect modifier', () => {
    const result = parseSpfRecord('v=spf1 redirect=_spf.example.com');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.mechanisms[0]!.type).toBe('redirect');
    expect(result.value.mechanisms[0]!.value).toBe('_spf.example.com');
  });

  it('should parse exp modifier', () => {
    const result = parseSpfRecord('v=spf1 ip4:1.2.3.0/24 exp=explain._spf.example.com -all');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const expMech = result.value.mechanisms.find((m) => m.type === 'exp');
    expect(expMech).toBeDefined();
    expect(expMech!.value).toBe('explain._spf.example.com');
  });

  it('should reject invalid mechanism types', () => {
    const result = parseSpfRecord('v=spf1 invalid:foo -all');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('Invalid SPF mechanism');
  });

  it('should parse a record with only -all (deny all)', () => {
    const result = parseSpfRecord('v=spf1 -all');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.mechanisms).toHaveLength(1);
    expect(result.value.mechanisms[0]!.type).toBe('all');
    expect(result.value.mechanisms[0]!.qualifier).toBe('-');
  });

  it('should parse a real-world complex SPF record', () => {
    const result = parseSpfRecord(
      'v=spf1 ip4:198.51.100.0/24 ip4:203.0.113.0/24 include:_spf.google.com include:servers.mcsv.net ~all',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.mechanisms).toHaveLength(5);
    expect(result.value.mechanisms[4]!.qualifier).toBe('~');
    expect(result.value.mechanisms[4]!.type).toBe('all');
  });

  it('should preserve the raw record string', () => {
    const raw = 'v=spf1 ip4:10.0.0.0/8 -all';
    const result = parseSpfRecord(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.raw).toBe(raw);
  });

  it('should handle exists mechanism', () => {
    const result = parseSpfRecord('v=spf1 exists:%{ir}.bl.example.com -all');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.mechanisms[0]!.type).toBe('exists');
    expect(result.value.mechanisms[0]!.value).toBe('%{ir}.bl.example.com');
  });

  it('should be case insensitive for the version tag', () => {
    const result = parseSpfRecord('V=spf1 ip4:10.0.0.1 -all');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.version).toBe('spf1');
  });
});
