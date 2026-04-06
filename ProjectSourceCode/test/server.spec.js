const server = require('../src/index');
const chai = require('chai');
const chaiHttp = require('chai-http');
const expect = chai.expect;

chai.use(chaiHttp);

describe('Testing Register API', () => {
  
    // i. positive test case
    it('positive : /register. Success on valid input', done => {
      chai
        .request(server)
        .post('/register')
        .send({ username: 'testuser@colorado.edu', password: 'password123' })
        .end((err, res) => {
          expect(res).to.have.status(200);
          expect(res.body.message).to.equals('Success');
          done();
        });
    });
  
    // ii. negative test case
    it('Negative : /register. Fail on missing password', done => {
      chai
        .request(server)
        .post('/register')
        .send({ username: 'baduser@colorado.edu' }) // Missing password field
        .end((err, res) => {
          expect(res).to.have.status(400);
          expect(res.body.message).to.equals('Invalid input');
          done();
        });
    });
});